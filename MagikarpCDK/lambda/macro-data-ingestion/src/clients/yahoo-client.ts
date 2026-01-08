/**
 * Yahoo Finance client for fetching market data
 *
 * Supports fetching:
 * - VIX (^VIX) - CBOE Volatility Index
 * - DXY (DX-Y.NYB) - US Dollar Index
 * - Stock OHLCV data (Open, High, Low, Close, Volume)
 * - Stock fundamental data (P/E, P/S, P/B, Market Cap, etc.)
 *
 * Rate Limit: No official limit, but we add delays to be respectful
 *
 * Note: Uses Yahoo Finance v8 API directly via axios for OHLCV data
 *       Uses yahoo-finance2 library for fundamental data
 */

import axios from 'axios';

interface YahooQuoteResponse {
    chart: {
        result: Array<{
            timestamp: number[];
            indicators: {
                quote: Array<{
                    open: number[];
                    high: number[];
                    low: number[];
                    close: number[];
                    volume: number[];
                }>;
                adjclose?: Array<{
                    adjclose: number[];
                }>;
            };
        }>;
        error: any;
    };
}

/**
 * End-of-day stock data structure
 */
export interface EndOfDayStockData {
    symbol: string;
    date: string;        // YYYY-MM-DD format
    timestamp: number;   // Unix timestamp
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    previousClose?: number;  // Previous day's close (if available)
    change?: number;         // Change from previous close (close - previousClose)
    changePercent?: number;  // Percentage change from previous close
    adjClose?: number;       // Adjusted close (if available)
}

/**
 * Stock fundamental data structure
 * Contains valuation ratios and key financial metrics
 */
export interface StockFundamentals {
    symbol: string;
    // Valuation Ratios
    peRatio: number | null;              // Price-to-Earnings (Trailing)
    forwardPE: number | null;            // Price-to-Earnings (Forward)
    pbRatio: number | null;              // Price-to-Book
    psRatio: number | null;              // Price-to-Sales (TTM)
    pegRatio: number | null;             // PEG Ratio (5-year expected)

    // Market Data
    marketCap: number | null;            // Market Capitalization
    enterpriseValue: number | null;      // Enterprise Value
    beta: number | null;                 // Beta (5Y Monthly)

    // Profitability Metrics
    profitMargin: number | null;         // Profit Margin (TTM)
    operatingMargin: number | null;      // Operating Margin (TTM)
    returnOnEquity: number | null;       // Return on Equity (TTM)
    returnOnAssets: number | null;       // Return on Assets (TTM)

    // Financial Health
    debtToEquity: number | null;         // Debt-to-Equity Ratio
    currentRatio: number | null;         // Current Ratio
    quickRatio: number | null;           // Quick Ratio

    // Per Share Data
    eps: number | null;                  // Earnings Per Share (TTM)
    revenuePerShare: number | null;      // Revenue Per Share (TTM)
    bookValuePerShare: number | null;    // Book Value Per Share

    // Dividend Data
    dividendYield: number | null;        // Dividend Yield (Forward Annual)
    dividendRate: number | null;         // Dividend Rate (Annual)
    payoutRatio: number | null;          // Payout Ratio

    // Growth Metrics
    revenueGrowth: number | null;        // Revenue Growth (YoY)
    earningsGrowth: number | null;       // Earnings Growth (YoY)

    // Additional Ratios
    priceToSales: number | null;         // Price-to-Sales (TTM) - alias for psRatio
    evToRevenue: number | null;          // EV/Revenue
    evToEbitda: number | null;           // EV/EBITDA

    // Timestamp
    lastUpdated: string;                 // ISO timestamp when data was fetched
}

export class YahooFinanceClient {
    private readonly baseUrl = 'https://query1.finance.yahoo.com/v8/finance/chart';
    private readonly maxRetries: number;
    private readonly retryBackoffBase: number;
    private readonly requestDelay: number; // Delay between requests in milliseconds

    constructor(
        maxRetries: number = 3,
        retryBackoffBase: number = 2.0,
        requestDelay: number = 100 // 100ms delay between requests
    ) {
        this.maxRetries = maxRetries;
        this.retryBackoffBase = retryBackoffBase;
        this.requestDelay = requestDelay;
    }

    /**
     * Fetch closing price for a ticker on a specific date
     * @param ticker Yahoo Finance ticker symbol (e.g., '^VIX', 'DX-Y.NYB')
     * @param date Date in YYYY-MM-DD format
     * @returns Closing price for the specified date, or null if not available
     */
    async fetchClosingPrice(ticker: string, date: string): Promise<number | null> {
        return this.fetchWithRetry(async () => {
            // Add delay to respect rate limits
            await this.sleep(this.requestDelay);

            // Convert date to Unix timestamps
            const targetDate = new Date(date);
            const period1 = Math.floor(targetDate.getTime() / 1000);
            const period2 = period1 + 86400; // Add 24 hours

            const url = `${this.baseUrl}/${ticker}`;

            try {
                const response = await axios.get<YahooQuoteResponse>(url, {
                    params: {
                        period1,
                        period2,
                        interval: '1d',
                        includePrePost: false
                    },
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
                    }
                });

                if (!response.data.chart.result || response.data.chart.result.length === 0) {
                    console.warn(`No data available for ${ticker} on ${date}`);
                    return null;
                }

                const result = response.data.chart.result[0];
                const quote = result.indicators.quote[0];

                if (!quote.close || quote.close.length === 0) {
                    console.warn(`No closing price available for ${ticker} on ${date}`);
                    return null;
                }

                const closePrice = quote.close[0];

                // Check for stale data (volume = 0 can indicate stale data)
                if (quote.volume && quote.volume[0] === 0) {
                    console.warn(`Potentially stale data for ${ticker} on ${date} (volume = 0)`);
                }

                // Validate closing price
                if (closePrice === null || closePrice === undefined) {
                    console.warn(`Missing closing price for ${ticker} on ${date}`);
                    return null;
                }

                if (isNaN(closePrice) || !isFinite(closePrice)) {
                    console.warn(`Invalid closing price for ${ticker} on ${date}: ${closePrice}`);
                    return null;
                }

                return closePrice;
            } catch (error) {
                // Let the retry logic handle the error
                throw error;
            }
        });
    }

    /**
     * Fetch VIX (CBOE Volatility Index) data
     * Ticker: ^VIX
     */
    async fetchVix(date: string): Promise<number | null> {
        return this.fetchClosingPrice('^VIX', date);
    }

    /**
     * Fetch DXY (US Dollar Index) data
     * Ticker: DX-Y.NYB
     */
    async fetchDxy(date: string): Promise<number | null> {
        return this.fetchClosingPrice('DX-Y.NYB', date);
    }

    /**
     * Fetch complete end-of-day stock data (OHLCV) for a ticker on a specific date
     * Returns all market data: Open, High, Low, Close, Volume
     *
     * @param symbol Stock ticker symbol (e.g., 'AAPL', 'MSFT', 'SPY')
     * @param date Date in YYYY-MM-DD format
     * @param includePreviousClose If true, fetches previous day's close to calculate change (requires additional API call)
     * @returns Complete end-of-day stock data, or null if not available
     *
     * @example
     * const stockData = await client.fetchEndOfDayData('AAPL', '2024-01-15', true);
     * if (stockData) {
     *   console.log(`${stockData.symbol} on ${stockData.date}:`);
     *   console.log(`  Open: ${stockData.open}`);
     *   console.log(`  High: ${stockData.high}`);
     *   console.log(`  Low: ${stockData.low}`);
     *   console.log(`  Close: ${stockData.close}`);
     *   console.log(`  Volume: ${stockData.volume}`);
     *   if (stockData.change) {
     *     console.log(`  Change: ${stockData.change} (${stockData.changePercent}%)`);
     *   }
     * }
     */
    async fetchEndOfDayData(symbol: string, date: string, includePreviousClose: boolean = false): Promise<EndOfDayStockData | null> {
        return this.fetchWithRetry(async () => {
            // Add delay to respect rate limits
            await this.sleep(this.requestDelay);

            // Convert date to Unix timestamps
            const targetDate = new Date(date);
            let period1 = Math.floor(targetDate.getTime() / 1000);
            const period2 = period1 + 86400; // Add 24 hours

            // If we need previous close, fetch 5 days of data to ensure we get at least 2 trading days
            if (includePreviousClose) {
                period1 = period1 - (86400 * 5); // Go back 5 days
            }

            const url = `${this.baseUrl}/${symbol}`;

            try {
                const response = await axios.get<YahooQuoteResponse>(url, {
                    params: {
                        period1,
                        period2,
                        interval: '1d',
                        includePrePost: false
                    },
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
                    }
                });

                if (!response.data.chart.result || response.data.chart.result.length === 0) {
                    console.warn(`No data available for ${symbol} on ${date}`);
                    return null;
                }

                const result = response.data.chart.result[0];
                const quote = result.indicators.quote[0];
                const timestamps = result.timestamp;

                // Validate that we have data
                if (!timestamps || timestamps.length === 0) {
                    console.warn(`No timestamp data available for ${symbol} on ${date}`);
                    return null;
                }

                if (!quote || !quote.open || !quote.high || !quote.low || !quote.close || !quote.volume) {
                    console.warn(`Incomplete OHLCV data for ${symbol} on ${date}`);
                    return null;
                }

                // Find the index for the target date
                const targetTimestamp = Math.floor(targetDate.getTime() / 1000);
                let idx = timestamps.findIndex(ts => {
                    const tsDate = new Date(ts * 1000);
                    const targetDateObj = new Date(targetTimestamp * 1000);
                    return tsDate.toDateString() === targetDateObj.toDateString();
                });

                // If not found, use the last entry (for single-day queries)
                if (idx === -1) {
                    idx = timestamps.length - 1;
                }
                const open = quote.open[idx];
                const high = quote.high[idx];
                const low = quote.low[idx];
                const close = quote.close[idx];
                const volume = quote.volume[idx];
                const timestamp = timestamps[idx];

                // Validate all values are present and valid
                const values = [open, high, low, close, volume];
                const hasInvalidData = values.some(val =>
                    val === null || val === undefined || isNaN(val) || !isFinite(val)
                );

                if (hasInvalidData) {
                    console.warn(`Invalid data values for ${symbol} on ${date}`);
                    return null;
                }

                // Basic sanity checks for OHLC data
                if (high < low) {
                    console.warn(`Invalid OHLC: high (${high}) < low (${low}) for ${symbol} on ${date}`);
                    return null;
                }

                if (open < low || open > high) {
                    console.warn(`Invalid OHLC: open (${open}) outside [low, high] range for ${symbol} on ${date}`);
                }

                if (close < low || close > high) {
                    console.warn(`Invalid OHLC: close (${close}) outside [low, high] range for ${symbol} on ${date}`);
                }

                // Check for potentially stale data
                if (volume === 0) {
                    console.warn(`Potentially stale data for ${symbol} on ${date} (volume = 0)`);
                }

                // Calculate previous close and change if requested
                let previousClose: number | undefined;
                let change: number | undefined;
                let changePercent: number | undefined;

                if (includePreviousClose && idx > 0) {
                    // Get previous day's close
                    previousClose = quote.close[idx - 1];

                    if (previousClose !== null && previousClose !== undefined && !isNaN(previousClose)) {
                        change = close - previousClose;
                        changePercent = (change / previousClose) * 100;
                    }
                }

                return {
                    symbol: symbol.toUpperCase(),
                    date: date,
                    timestamp: timestamp,
                    open: open,
                    high: high,
                    low: low,
                    close: close,
                    volume: volume,
                    previousClose: previousClose,
                    change: change,
                    changePercent: changePercent
                };

            } catch (error) {
                // Let the retry logic handle the error
                throw error;
            }
        });
    }

    /**
     * Fetch fundamental data for a stock (P/E, P/S, P/B, etc.)
     * Uses yahoo-finance2 library to fetch quoteSummary data
     *
     * @param symbol Stock ticker symbol (e.g., 'AAPL', 'MSFT', 'TSLA')
     * @returns Fundamental data or null if not available
     *
     * @example
     * const fundamentals = await client.fetchFundamentals('AAPL');
     * if (fundamentals) {
     *   console.log(`P/E Ratio: ${fundamentals.peRatio}`);
     *   console.log(`P/S Ratio: ${fundamentals.psRatio}`);
     *   console.log(`P/B Ratio: ${fundamentals.pbRatio}`);
     *   console.log(`Market Cap: $${fundamentals.marketCap}`);
     * }
     */
    async fetchFundamentals(symbol: string): Promise<StockFundamentals | null> {
        return this.fetchWithRetry(async () => {
            // Add delay to respect rate limits
            await this.sleep(this.requestDelay);

            try {
                // Dynamic import for ESM module
                // @ts-ignore - yahoo-finance2 is pure ESM, using dynamic import
                const yahooFinance = await import('yahoo-finance2');

                // Fetch quote summary with all financial modules
                const result = await yahooFinance.default.quoteSummary(symbol, {
                    modules: [
                        'summaryDetail',      // P/E, Beta, Market Cap, Dividend Yield
                        'defaultKeyStatistics', // P/S, P/B, PEG, Forward P/E
                        'financialData',      // Profit margins, ROE, ROA, Revenue growth
                    ]
                });

                const summaryDetail = result.summaryDetail;
                const keyStats = result.defaultKeyStatistics;
                const financialData = result.financialData;

                if (!summaryDetail && !keyStats && !financialData) {
                    console.warn(`No fundamental data available for ${symbol}`);
                    return null;
                }

                // Extract data with fallbacks for missing values
                return {
                    symbol: symbol.toUpperCase(),

                    // Valuation Ratios
                    peRatio: summaryDetail?.trailingPE ?? null,
                    forwardPE: summaryDetail?.forwardPE ?? null,
                    pbRatio: keyStats?.priceToBook ?? null,
                    psRatio: summaryDetail?.priceToSalesTrailing12Months ?? null,
                    pegRatio: keyStats?.pegRatio ?? null,

                    // Market Data
                    marketCap: summaryDetail?.marketCap ?? null,
                    enterpriseValue: keyStats?.enterpriseValue ?? null,
                    beta: summaryDetail?.beta ?? null,

                    // Profitability Metrics
                    profitMargin: financialData?.profitMargins ?? null,
                    operatingMargin: financialData?.operatingMargins ?? null,
                    returnOnEquity: financialData?.returnOnEquity ?? null,
                    returnOnAssets: financialData?.returnOnAssets ?? null,

                    // Financial Health
                    debtToEquity: financialData?.debtToEquity ?? null,
                    currentRatio: financialData?.currentRatio ?? null,
                    quickRatio: financialData?.quickRatio ?? null,

                    // Per Share Data
                    eps: keyStats?.trailingEps ?? null,
                    revenuePerShare: financialData?.revenuePerShare ?? null,
                    bookValuePerShare: keyStats?.bookValue ?? null,

                    // Dividend Data
                    dividendYield: summaryDetail?.dividendYield ?? null,
                    dividendRate: summaryDetail?.dividendRate ?? null,
                    payoutRatio: summaryDetail?.payoutRatio ?? null,

                    // Growth Metrics
                    revenueGrowth: financialData?.revenueGrowth ?? null,
                    earningsGrowth: financialData?.earningsGrowth ?? null,

                    // Additional Ratios
                    priceToSales: summaryDetail?.priceToSalesTrailing12Months ?? null,
                    evToRevenue: keyStats?.enterpriseToRevenue ?? null,
                    evToEbitda: keyStats?.enterpriseToEbitda ?? null,

                    // Timestamp
                    lastUpdated: new Date().toISOString()
                };

            } catch (error) {
                // Let the retry logic handle the error
                throw error;
            }
        });
    }

    /**
     * Fetch both OHLCV data and fundamental data for a stock
     * Convenience method that combines fetchEndOfDayData and fetchFundamentals
     *
     * @param symbol Stock ticker symbol
     * @param date Date in YYYY-MM-DD format for OHLCV data
     * @returns Object containing both OHLCV and fundamental data
     *
     * @example
     * const data = await client.fetchCompleteStockData('AAPL', '2024-12-13');
     * if (data.ohlcv && data.fundamentals) {
     *   console.log(`Close: $${data.ohlcv.close}`);
     *   console.log(`P/E: ${data.fundamentals.peRatio}`);
     * }
     */
    async fetchCompleteStockData(symbol: string, date: string): Promise<{
        ohlcv: EndOfDayStockData | null;
        fundamentals: StockFundamentals | null;
    }> {
        // Fetch both in parallel for efficiency
        const [ohlcv, fundamentals] = await Promise.all([
            this.fetchEndOfDayData(symbol, date),
            this.fetchFundamentals(symbol)
        ]);

        return { ohlcv, fundamentals };
    }

    /**
     * Retry logic with exponential backoff for network errors
     * @param fetchFunc Function to execute with retry logic
     * @returns Result of the fetch function or null if all retries fail
     */
    private async fetchWithRetry<T>(
        fetchFunc: () => Promise<T>
    ): Promise<T | null> {
        for (let attempt = 0; attempt < this.maxRetries; attempt++) {
            try {
                return await fetchFunc();
            } catch (error) {
                const isLastAttempt = attempt === this.maxRetries - 1;

                if (this.isRateLimitError(error)) {
                    const retryAfter = this.getRetryAfter(error);
                    console.warn(`Rate limit error. Waiting ${retryAfter}ms before retry`);
                    await this.sleep(retryAfter);
                    continue;
                }

                if (this.isNetworkError(error)) {
                    if (isLastAttempt) {
                        console.error(`Network error after ${this.maxRetries} attempts:`, this.getErrorMessage(error));
                        return null;
                    }

                    const waitTime = this.calculateBackoff(attempt);
                    console.warn(`Network error on attempt ${attempt + 1}. Retrying in ${waitTime}ms...`);
                    await this.sleep(waitTime);
                    continue;
                }

                // Non-retryable error
                console.error('Non-retryable error:', this.getErrorMessage(error));
                return null;
            }
        }

        return null;
    }

    /**
     * Calculate exponential backoff with jitter
     * @param attempt Current attempt number (0-indexed)
     * @returns Wait time in milliseconds
     */
    private calculateBackoff(attempt: number): number {
        const baseDelay = Math.pow(this.retryBackoffBase, attempt) * 1000;
        const jitter = Math.random() * 1000; // Add up to 1 second of jitter
        return Math.min(baseDelay + jitter, 30000); // Cap at 30 seconds
    }

    /**
     * Check if error is a rate limit error (429)
     */
    private isRateLimitError(error: unknown): boolean {
        if (axios.isAxiosError(error)) {
            return error.response?.status === 429;
        }
        return false;
    }

    /**
     * Check if error is a network error (retryable)
     */
    private isNetworkError(error: unknown): boolean {
        if (axios.isAxiosError(error)) {
            // Network errors, timeouts, 5xx server errors are retryable
            return (
                !error.response || // Network error (no response)
                error.code === 'ECONNABORTED' || // Timeout
                error.code === 'ETIMEDOUT' ||
                (error.response.status >= 500 && error.response.status < 600) // Server errors
            );
        }
        return false;
    }

    /**
     * Get retry-after time from error response
     * @param error Axios error
     * @returns Wait time in milliseconds
     */
    private getRetryAfter(error: unknown): number {
        if (axios.isAxiosError(error) && error.response) {
            const retryAfter = error.response.headers['retry-after'];
            if (retryAfter) {
                const seconds = parseInt(retryAfter, 10);
                if (!isNaN(seconds)) {
                    return seconds * 1000;
                }
            }
        }
        return 60000; // Default to 60 seconds
    }

    /**
     * Extract error message from various error types
     */
    private getErrorMessage(error: unknown): string {
        if (axios.isAxiosError(error)) {
            return error.message + (error.response?.data ? ` - ${JSON.stringify(error.response.data)}` : '');
        }
        if (error instanceof Error) {
            return error.message;
        }
        return String(error);
    }

    /**
     * Sleep for specified milliseconds
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
