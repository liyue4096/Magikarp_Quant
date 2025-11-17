/**
 * Main service class for macro data ingestion
 */

import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { FredApiClient } from './clients/fred-client';
import { YahooFinanceClient } from './clients/yahoo-client';
import { MacroDataConfig, FetchResult, BackfillResult, MacroIndicators } from './types';
import { getTradingDaysBetween, isMarketOpen } from './market-calendar';

/**
 * Load configuration from environment variables
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
 */
export function loadConfigFromEnv(): MacroDataConfig {
    const fredApiKey = process.env.FRED_API_KEY;
    if (!fredApiKey) {
        throw new Error('Missing required environment variable: FRED_API_KEY');
    }

    const tableName = process.env.MACRO_INDICATORS_TABLE;
    if (!tableName) {
        throw new Error('Missing required environment variable: MACRO_INDICATORS_TABLE');
    }

    return {
        fredApiKey,
        tableName,
        awsRegion: process.env.AWS_REGION || 'us-west-2',
        retryAttempts: 3,
        retryBackoffBase: 2.0
    };
}

/**
 * Main service class for macro data ingestion
 * Orchestrates fetching data from multiple sources, calculating derived metrics,
 * validating data, and storing in DynamoDB
 */
export class MacroDataIngestionService {
    private fredClient: FredApiClient;
    private yahooClient: YahooFinanceClient;
    private dynamoClient: DynamoDBClient;
    private tableName: string;
    private config: MacroDataConfig;

    constructor(config?: MacroDataConfig) {
        // Load config from environment if not provided
        this.config = config || loadConfigFromEnv();

        // Initialize API clients
        this.fredClient = new FredApiClient(
            this.config.fredApiKey,
            this.config.retryAttempts,
            this.config.retryBackoffBase
        );
        this.yahooClient = new YahooFinanceClient(
            this.config.retryAttempts,
            this.config.retryBackoffBase
        );

        // Initialize DynamoDB client
        this.dynamoClient = new DynamoDBClient({
            region: this.config.awsRegion
        });

        this.tableName = this.config.tableName;
    }

    /**
     * Fetch data from FRED API for a specific series and date
     * Private helper method for internal use
     */
    private async fetchFredData(seriesId: string, date: string): Promise<number | null> {
        try {
            return await this.fredClient.fetchSeries(seriesId, date);
        } catch (error) {
            console.error(`Error fetching FRED series ${seriesId} for ${date}:`, error);
            return null;
        }
    }

    /**
     * Fetch data from Yahoo Finance for a specific ticker and date
     * Private helper method for internal use
     */
    private async fetchYahooData(ticker: string, date: string): Promise<number | null> {
        try {
            return await this.yahooClient.fetchClosingPrice(ticker, date);
        } catch (error) {
            console.error(`Error fetching Yahoo Finance ticker ${ticker} for ${date}:`, error);
            return null;
        }
    }

    /**
     * Calculate year-over-year CPI change percentage
     * Requirement: 2.2
     * 
     * @param currentCpi Current CPI value
     * @param date Current date in YYYY-MM-DD format
     * @returns Year-over-year percentage change, or null if previous year data unavailable
     */
    private async calculateCpiYoy(currentCpi: number, date: string): Promise<number | null> {
        try {
            // Calculate date one year ago
            const currentDate = new Date(date);
            const previousYearDate = new Date(currentDate);
            previousYearDate.setFullYear(currentDate.getFullYear() - 1);
            const previousYearDateStr = previousYearDate.toISOString().split('T')[0];

            // Fetch CPI from one year ago
            const previousYearCpi = await this.fredClient.fetchCpi(previousYearDateStr);

            if (previousYearCpi === null || previousYearCpi === 0) {
                console.warn(`Cannot calculate CPI YoY for ${date}: previous year CPI unavailable or zero`);
                return null;
            }

            // Calculate percentage change: ((current - previous) / previous) * 100
            const yoyChange = ((currentCpi - previousYearCpi) / previousYearCpi) * 100;

            return yoyChange;
        } catch (error) {
            console.error(`Error calculating CPI YoY for ${date}:`, error);
            return null;
        }
    }

    /**
     * Calculate yield curve spread (10-year minus 2-year Treasury yield)
     * Requirement: 2.1
     * 
     * @param treasury10y 10-year Treasury yield
     * @param treasury2y 2-year Treasury yield
     * @returns Yield curve spread in percentage points
     */
    private calculateYieldSpread(treasury10y: number, treasury2y: number): number {
        return treasury10y - treasury2y;
    }

    /**
     * Write macro indicators data to DynamoDB
     * Requirements: 4.1, 4.2, 4.3, 4.4
     * 
     * @param date Date in YYYY-MM-DD format (partition key)
     * @param data MacroIndicators data to write
     * @returns Promise<boolean> true if write successful, false otherwise
     */
    private async writeToDynamoDB(date: string, data: MacroIndicators): Promise<boolean> {
        // Add last_updated timestamp in ISO 8601 format (Requirement 4.2)
        const recordToWrite = {
            ...data,
            date,
            last_updated: new Date().toISOString()
        };

        let attempt = 0;
        const maxAttempts = this.config.retryAttempts;

        while (attempt < maxAttempts) {
            try {
                // Convert JavaScript object to DynamoDB format using marshall utility
                const item = marshall(recordToWrite, {
                    removeUndefinedValues: true  // Remove undefined values from the object
                });

                // Create PutItem command (Requirement 4.1, 4.3)
                const command = new PutItemCommand({
                    TableName: this.tableName,
                    Item: item
                });

                // Execute the write operation
                await this.dynamoClient.send(command);

                console.log(`Successfully wrote data to DynamoDB for date: ${date}`);
                return true;

            } catch (error: any) {
                attempt++;

                // Handle ProvisionedThroughputExceededException (Requirement 4.4)
                if (error.name === 'ProvisionedThroughputExceededException') {
                    if (attempt < maxAttempts) {
                        // Calculate exponential backoff delay
                        const backoffDelay = Math.pow(this.config.retryBackoffBase, attempt) * 1000;
                        const jitter = Math.random() * 1000;  // Add jitter to prevent thundering herd
                        const totalDelay = backoffDelay + jitter;

                        console.warn(
                            `ProvisionedThroughputExceededException on attempt ${attempt}/${maxAttempts}. ` +
                            `Retrying in ${Math.round(totalDelay)}ms...`
                        );

                        await new Promise(resolve => setTimeout(resolve, totalDelay));
                        continue;
                    }
                }

                // Handle other DynamoDB errors with retry logic (Requirement 4.4)
                if (attempt < maxAttempts) {
                    // Calculate exponential backoff delay
                    const backoffDelay = Math.pow(this.config.retryBackoffBase, attempt) * 1000;
                    const jitter = Math.random() * 1000;
                    const totalDelay = backoffDelay + jitter;

                    console.warn(
                        `DynamoDB write error on attempt ${attempt}/${maxAttempts}: ${error.message}. ` +
                        `Retrying in ${Math.round(totalDelay)}ms...`
                    );

                    await new Promise(resolve => setTimeout(resolve, totalDelay));
                    continue;
                } else {
                    // Max retries exceeded
                    console.error(
                        `Failed to write to DynamoDB after ${maxAttempts} attempts for date ${date}:`,
                        error
                    );
                    return false;
                }
            }
        }

        return false;
    }

    /**
     * Fetch and store macroeconomic data for a specific date
     * Orchestrates the entire data pipeline:
     * 1. Fetch data from all sources in parallel
     * 2. Validate VIX data
     * 3. Calculate derived metrics
     * 4. Validate all data
     * 5. Write to DynamoDB
     * 
     * Requirements: 1.1-1.8, 2.1-2.3, 3.1, 4.1, 6.4
     * 
     * @param date Date in YYYY-MM-DD format
     * @returns FetchResult with success status, data, and any errors
     */
    async fetchDailyData(date: string): Promise<FetchResult> {
        // Check if this is a trading day
        if (!isMarketOpen(date)) {
            console.warn(`${date} is not a trading day (weekend or holiday). Skipping.`);
            return {
                success: false,
                date,
                errors: [`${date} is not a trading day`]
            };
        }

        console.log(`Fetching macro data for ${date}...`);
        const errors: string[] = [];

        try {
            // Step 1: Fetch data from all sources in parallel (Requirements 1.1-1.8, 6.4)
            console.log('Fetching data from all sources in parallel...');
            const [
                gdpGrowth,
                cpi,
                interestRate,
                vix,
                dxy,
                treasury2y,
                treasury10y,
                iceBofaBbb
            ] = await Promise.all([
                this.fredClient.fetchGdpGrowth(date),           // Requirement 1.1
                this.fredClient.fetchCpi(date),                 // Requirement 1.2
                this.fredClient.fetchFederalFundsRate(date),    // Requirement 1.3
                this.yahooClient.fetchVix(date),                // Requirement 1.4
                this.yahooClient.fetchDxy(date),                // Requirement 1.5
                this.fredClient.fetchTreasury2Year(date),       // Requirement 1.6
                this.fredClient.fetchTreasury10Year(date),      // Requirement 1.7
                this.fredClient.fetchIceBofaBbb(date)           // Requirement 1.8
            ]);

            // Step 2: Perform cross-validation on VIX data (basic validation)
            // Note: Full VIX validation logic will be implemented in task 8
            if (vix !== null) {
                if (vix < 0 || vix > 100) {
                    errors.push(`VIX value ${vix} is out of acceptable range [0, 100]`);
                }
            }

            // Step 3: Calculate derived metrics

            // Calculate CPI year-over-year change (Requirement 2.2)
            let cpiYoy: number | null = null;
            if (cpi !== null) {
                cpiYoy = await this.calculateCpiYoy(cpi, date);
                if (cpiYoy === null) {
                    console.warn(`Could not calculate CPI YoY for ${date}`);
                }
            }

            // Calculate yield curve spread (Requirement 2.1)
            let yieldCurveSpread: number | null = null;
            if (treasury10y !== null && treasury2y !== null) {
                yieldCurveSpread = this.calculateYieldSpread(treasury10y, treasury2y);
            }

            // Check for required fields
            if (cpi === null) {
                errors.push('CPI data is required but not available');
            }
            if (cpiYoy === null) {
                errors.push('CPI YoY data is required but could not be calculated');
            }
            if (interestRate === null) {
                errors.push('Interest rate data is required but not available');
            }
            if (vix === null) {
                errors.push('VIX data is required but not available');
            }
            if (dxy === null) {
                errors.push('DXY data is required but not available');
            }
            if (treasury2y === null) {
                errors.push('2-year Treasury data is required but not available');
            }
            if (treasury10y === null) {
                errors.push('10-year Treasury data is required but not available');
            }
            if (yieldCurveSpread === null) {
                errors.push('Yield curve spread is required but could not be calculated');
            }
            if (iceBofaBbb === null) {
                errors.push('ICE BofA BBB data is required but not available');
            }

            // If any required fields are missing, return error
            if (errors.length > 0) {
                console.error(`Missing required data for ${date}:`, errors);
                return {
                    success: false,
                    date,
                    errors
                };
            }

            // Build MacroIndicators object (Requirement 2.3)
            const macroData: MacroIndicators = {
                date,
                gdp_growth: gdpGrowth !== null ? gdpGrowth : undefined,  // Optional field
                cpi: cpi!,  // Required, checked above
                cpi_yoy: cpiYoy!,  // Required, checked above
                interest_rate: interestRate!,  // Required, checked above
                vix: vix!,  // Required, checked above
                dxy: dxy!,  // Required, checked above
                treasury_2y: treasury2y!,  // Required, checked above
                treasury_10y: treasury10y!,  // Required, checked above
                yield_curve_spread: yieldCurveSpread!,  // Required, checked above
                ice_bofa_bbb: iceBofaBbb!,  // Required, checked above
                last_updated: new Date().toISOString()
            };

            // Step 4: Validate all data using validation module (Requirement 3.1)
            console.log('Validating data...');
            const { validateData } = await import('./validation');
            const validationResult = validateData(macroData);

            // Log validation errors/warnings
            if (validationResult.errors.length > 0) {
                console.warn(`Validation issues for ${date}:`, validationResult.errors);

                // Separate warnings from errors
                const warnings = validationResult.errors.filter(e => e.startsWith('WARNING:'));
                const validationErrors = validationResult.errors.filter(e => !e.startsWith('WARNING:'));

                // Log warnings but don't fail
                if (warnings.length > 0) {
                    console.warn('Validation warnings:', warnings);
                }

                // If there are actual errors (not just warnings), fail
                if (validationErrors.length > 0) {
                    console.error('Validation errors:', validationErrors);
                    return {
                        success: false,
                        date,
                        errors: validationErrors
                    };
                }
            }

            // Step 5: Write validated data to DynamoDB (Requirement 4.1)
            console.log('Writing data to DynamoDB...');
            const writeSuccess = await this.writeToDynamoDB(date, macroData);

            if (!writeSuccess) {
                return {
                    success: false,
                    date,
                    errors: ['Failed to write data to DynamoDB']
                };
            }

            // Step 6: Return success result
            console.log(`Successfully fetched and stored macro data for ${date}`);
            return {
                success: true,
                date,
                data: macroData
            };

        } catch (error) {
            console.error(`Error fetching daily data for ${date}:`, error);
            return {
                success: false,
                date,
                errors: [error instanceof Error ? error.message : String(error)]
            };
        }
    }

    /**
     * Backfill historical data for a date range
     * Processes dates in batches with rate limiting delays
     * Requirements: 5.1, 5.2, 5.3, 5.4
     * 
     * @param startDate Start date in YYYY-MM-DD format
     * @param endDate End date in YYYY-MM-DD format
     * @param batchSize Number of dates to process before adding delay (default: 10)
     * @returns BackfillResult with summary statistics
     */
    async backfill(
        startDate: string,
        endDate: string,
        batchSize: number = 10
    ): Promise<BackfillResult> {
        // Requirement 5.1: Generate array of dates in the specified range
        // Get only trading days in the range (skip weekends and holidays)
        const tradingDays = getTradingDaysBetween(startDate, endDate);

        console.log(`Starting backfill: ${tradingDays.length} trading days from ${startDate} to ${endDate}`);
        console.log(`Skipping weekends and holidays`);

        // Initialize counters for summary statistics
        let successCount = 0;
        let failureCount = 0;
        const errors: string[] = [];

        // Requirement 5.2: Process dates in the specified range
        // Requirement 5.3: Process dates in batches with rate limiting delays
        for (let i = 0; i < tradingDays.length; i++) {
            const date = tradingDays[i];

            try {
                // Requirement 5.2: Call fetchDailyData for each date
                const result = await this.fetchDailyData(date);

                if (result.success) {
                    successCount++;
                } else {
                    failureCount++;
                    // Collect errors for this date
                    if (result.errors && result.errors.length > 0) {
                        errors.push(`${date}: ${result.errors.join(', ')}`);
                    }
                }

                // Requirement 5.4: Log progress every 10 records
                if ((i + 1) % 10 === 0) {
                    console.log(
                        `Progress: ${i + 1}/${tradingDays.length} dates processed. ` +
                        `Success: ${successCount}, Failures: ${failureCount}`
                    );
                }

                // Requirement 5.3: Add rate limiting delays between batches
                // Add delay after each batch to respect API rate limits
                if ((i + 1) % batchSize === 0 && i < tradingDays.length - 1) {
                    // FRED API limit: 120 requests/minute
                    // With 8 FRED requests per date, we can do ~15 dates/minute
                    // Add 4 second delay after each batch of 10 to be safe
                    const delayMs = 4000;
                    console.log(`Batch complete. Waiting ${delayMs}ms to respect API rate limits...`);
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }

            } catch (error) {
                failureCount++;
                const errorMessage = error instanceof Error ? error.message : String(error);
                errors.push(`${date}: ${errorMessage}`);
                console.error(`Error processing date ${date}:`, error);
            }
        }

        // Log final summary
        console.log(`Backfill complete: ${successCount} successes, ${failureCount} failures`);

        // Return BackfillResult with summary statistics
        return {
            successCount,
            failureCount,
            errors
        };
    }
}
