/**
 * Main service class for macro data ingestion
 */

import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { FredApiClient } from './clients/fred-client';
import { YahooFinanceClient } from './clients/yahoo-client';
import { MacroDataConfig, FetchResult, BackfillResult, MacroIndicators } from './types';
import { getTradingDaysBetween, isMarketOpen, getPreviousBusinessDay } from './market-calendar';

/**
 * Load configuration from environment variables
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
 * 
 * Note: FRED API key is fetched from SSM Parameter Store during service initialization,
 * not from environment variables. This function validates other required environment variables.
 */
export function loadConfigFromEnv(): Omit<MacroDataConfig, 'fredApiKey'> {
    const tableName = process.env.MACRO_INDICATORS_TABLE;
    if (!tableName) {
        throw new Error('Missing required environment variable: MACRO_INDICATORS_TABLE');
    }

    const fredApiKeyParameter = process.env.FRED_API_KEY_PARAMETER;
    if (!fredApiKeyParameter) {
        throw new Error('Missing required environment variable: FRED_API_KEY_PARAMETER');
    }

    return {
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
 * 
 * Requirements: 9.1, 9.2, 9.5
 */
export class MacroDataIngestionService {
    private fredClient: FredApiClient | null = null;
    private yahooClient: YahooFinanceClient;
    private dynamoClient: DynamoDBClient;
    private tableName: string;
    private config: Omit<MacroDataConfig, 'fredApiKey'>;
    private initialized: boolean = false;

    constructor(config?: MacroDataConfig) {
        if (config) {
            // If full config is provided (for testing), use it directly
            this.config = {
                tableName: config.tableName,
                awsRegion: config.awsRegion,
                retryAttempts: config.retryAttempts,
                retryBackoffBase: config.retryBackoffBase
            };

            // Initialize API clients immediately
            this.fredClient = new FredApiClient(
                config.fredApiKey,
                config.retryAttempts,
                config.retryBackoffBase
            );
            this.yahooClient = new YahooFinanceClient(
                config.retryAttempts,
                config.retryBackoffBase
            );
            this.initialized = true;
        } else {
            // Load config from environment (without FRED API key)
            this.config = loadConfigFromEnv();

            // Initialize Yahoo client (doesn't need API key)
            this.yahooClient = new YahooFinanceClient(
                this.config.retryAttempts,
                this.config.retryBackoffBase
            );

            // FRED client will be initialized lazily on first use
            // This allows us to fetch the API key from SSM Parameter Store
        }

        // Initialize DynamoDB client
        this.dynamoClient = new DynamoDBClient({
            region: this.config.awsRegion
        });

        this.tableName = this.config.tableName;
    }

    /**
     * Initialize the service by fetching API keys from SSM Parameter Store
     * Requirements: 9.1, 9.2, 9.5
     * 
     * This method is called automatically on first use, but can be called explicitly
     * to handle initialization errors early.
     */
    private async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }

        console.log('Initializing MacroDataIngestionService...');

        try {
            // Fetch FRED API key from SSM Parameter Store (Requirement 9.1, 9.2)
            const { getFredApiKey } = await import('./secrets.js');
            const fredApiKey = await getFredApiKey();

            // Initialize FRED client with API key from Parameter Store
            this.fredClient = new FredApiClient(
                fredApiKey,
                this.config.retryAttempts,
                this.config.retryBackoffBase
            );

            this.initialized = true;
            console.log('MacroDataIngestionService initialized successfully');

        } catch (error) {
            console.error('Failed to initialize MacroDataIngestionService:', error);
            throw new Error(`Service initialization failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Ensure the service is initialized before use
     * Requirements: 9.1, 9.2, 9.5
     */
    private async ensureInitialized(): Promise<void> {
        if (!this.initialized) {
            await this.initialize();
        }

        if (!this.fredClient) {
            throw new Error('FRED client not initialized');
        }
    }

    /**
     * Fetch data from FRED API for a specific series and date
     * Private helper method for internal use
     */
    private async fetchFredData(seriesId: string, date: string): Promise<number | null> {
        try {
            if (!this.fredClient) {
                throw new Error('FRED client not initialized');
            }
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
            // Ensure fredClient is initialized
            if (!this.fredClient) {
                throw new Error('FRED client not initialized');
            }

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
     * 1. Initialize service (fetch API keys from SSM Parameter Store)
     * 2. Fetch data from all sources in parallel
     * 3. Validate VIX data
     * 4. Calculate derived metrics
     * 5. Validate all data
     * 6. Write to DynamoDB
     * 
     * Requirements: 1.1-1.8, 2.1-2.3, 3.1, 4.1, 6.4, 9.1, 9.2, 9.5
     * 
     * @param date Date in YYYY-MM-DD format
     * @returns FetchResult with success status, data, and any errors
     */
    async fetchDailyData(date: string): Promise<FetchResult> {
        // Ensure service is initialized (fetch API keys from SSM Parameter Store)
        // Requirements: 9.1, 9.2, 9.5
        await this.ensureInitialized();
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
            // Calculate previous business day for FRED data
            const previousBusinessDay = getPreviousBusinessDay(date);
            console.log(`Using previous business day ${previousBusinessDay} for FRED data`);

            // Step 1: Fetch data from all sources in parallel (Requirements 1.1-1.8, 6.4)
            console.log('Fetching data from all sources in parallel...');

            // Ensure fredClient is initialized
            if (!this.fredClient) {
                throw new Error('FRED client not initialized');
            }

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
                this.fredClient.fetchGdpGrowth(previousBusinessDay),           // Requirement 1.1 - monthly/quarterly, use previous business day
                this.fredClient.fetchCpi(previousBusinessDay),                 // Requirement 1.2 - monthly, use previous business day
                this.fredClient.fetchSeriesWithFallback('DFF', previousBusinessDay),    // Requirement 1.3 - daily, use fallback
                this.yahooClient.fetchVix(date),                // Requirement 1.4 - real-time, use current date
                this.yahooClient.fetchDxy(date),                // Requirement 1.5 - real-time, use current date
                this.fredClient.fetchSeriesWithFallback('DGS2', previousBusinessDay),       // Requirement 1.6 - daily, use fallback
                this.fredClient.fetchSeriesWithFallback('DGS10', previousBusinessDay),      // Requirement 1.7 - daily, use fallback
                this.fredClient.fetchSeriesWithFallback('BAMLC0A4CBBBEY', previousBusinessDay)           // Requirement 1.8 - daily, use fallback
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
            if (cpi !== null && this.fredClient) {
                cpiYoy = await this.calculateCpiYoy(cpi, previousBusinessDay);
                if (cpiYoy === null) {
                    console.warn(`Could not calculate CPI YoY for ${date}`);
                }
            }

            // Calculate yield curve spread (Requirement 2.1)
            let yieldCurveSpread: number | null = null;
            if (treasury10y !== null && treasury2y !== null) {
                yieldCurveSpread = this.calculateYieldSpread(treasury10y, treasury2y);
            }

            // Check for required fields (CPI and CPI YoY are optional - monthly data)
            if (interestRate === null) {
                errors.push('Interest rate data is required but not available');
            }
            if (vix === null) {
                errors.push('VIX data is required but not available');
            }
            // DXY is now optional - Yahoo Finance data may not be available for all dates
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

            // Helper function to round to 2 decimal places
            const round = (value: number | null): number | undefined => {
                return value !== null ? Math.round(value * 100) / 100 : undefined;
            };

            // Build MacroIndicators object (Requirement 2.3)
            const macroData: MacroIndicators = {
                date,
                gdp_growth: round(gdpGrowth),  // Optional field
                cpi: round(cpi),  // Optional field
                cpi_yoy: round(cpiYoy),  // Optional field
                interest_rate: round(interestRate)!,  // Required, checked above
                vix: round(vix)!,  // Required, checked above
                dxy: round(dxy),  // Optional - Yahoo Finance data may not be available
                treasury_2y: round(treasury2y)!,  // Required, checked above
                treasury_10y: round(treasury10y)!,  // Required, checked above
                yield_curve_spread: round(yieldCurveSpread)!,  // Required, checked above
                ice_bofa_bbb: round(iceBofaBbb)!,  // Required, checked above
                last_updated: new Date().toISOString()
            };

            // Step 4: Validate all data using validation module (Requirement 3.1)
            console.log('Validating data...');
            const { validateData } = await import('./validation.js');
            const validationResult = validateData(macroData);

            // Log validation errors/warnings
            if (validationResult.errors.length > 0) {
                console.warn(`Validation issues for ${date}:`, validationResult.errors);

                // Separate warnings from errors
                const warnings = validationResult.errors.filter((e: string) => e.startsWith('WARNING:'));
                const validationErrors = validationResult.errors.filter((e: string) => !e.startsWith('WARNING:'));

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
     * Requirements: 5.1, 5.2, 5.3, 5.4, 9.1, 9.2, 9.5
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
        // Ensure service is initialized (fetch API keys from SSM Parameter Store)
        // Requirements: 9.1, 9.2, 9.5
        await this.ensureInitialized();
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
                    // With 8 FRED requests per date, we can do ~15 dates/minute max
                    // Batch of 10 days = 80 API calls, needs ~40 seconds to stay under limit
                    // Add 45 second delay after each batch of 10 to be safe
                    const delayMs = 45000;
                    console.log(`Batch of ${batchSize} days complete. Waiting ${delayMs}ms to respect FRED rate limits...`);
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
