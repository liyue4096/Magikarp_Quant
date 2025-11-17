/**
 * Alpha Vantage API client for fetching market data
 * 
 * Note: Alpha Vantage does NOT support VIX directly in their free tier.
 * VIX is a CBOE index and requires special data feeds.
 * 
 * This client is designed for cross-validation but will gracefully degrade
 * when VIX data is unavailable. The primary VIX source should be Yahoo Finance.
 * 
 * Alternative: Could use SPY (S&P 500 ETF) volatility as a proxy, but this
 * is not implemented as it's not a direct VIX replacement.
 * 
 * Rate Limit: 25 requests per day (free tier)
 */

import axios from 'axios';

interface AlphaVantageTimeSeriesDaily {
    [date: string]: {
        '1. open': string;
        '2. high': string;
        '3. low': string;
        '4. close': string;
        '5. volume': string;
    };
}

interface AlphaVantageResponse {
    'Meta Data'?: {
        '1. Information': string;
        '2. Symbol': string;
        '3. Last Refreshed': string;
        '4. Output Size': string;
        '5. Time Zone': string;
    };
    'Time Series (Daily)'?: AlphaVantageTimeSeriesDaily;
    'Note'?: string;  // Rate limit message
    'Error Message'?: string;
}

export class AlphaVantageClient {
    private readonly baseUrl = 'https://www.alphavantage.co/query';
    private readonly maxRetries: number;
    private readonly retryBackoffBase: number;
    private requestCount = 0;
    private requestWindowStart = Date.now();
    private readonly rateLimit = 25; // requests per day for free tier
    private readonly rateLimitWindow = 86400000; // 24 hours in milliseconds
    private isAvailable = true; // Track if API is available

    constructor(
        private apiKey: string,
        maxRetries: number = 3,
        retryBackoffBase: number = 2.0
    ) {
        this.maxRetries = maxRetries;
        this.retryBackoffBase = retryBackoffBase;
    }

    /**
     * Fetch VIX data from Alpha Vantage for a specific date
     * 
     * IMPORTANT: Alpha Vantage does NOT support VIX in their free tier API.
     * VIX is a CBOE proprietary index that requires special data feeds.
     * 
     * This method will always return null and log a warning, implementing
     * graceful degradation as specified in the requirements.
     * 
     * For actual VIX data, use Yahoo Finance client as the primary source.
     * 
     * @param date Date in YYYY-MM-DD format
     * @returns Always returns null (VIX not supported by Alpha Vantage free tier)
     */
    async fetchVix(date: string): Promise<number | null> {
        // Alpha Vantage does not support VIX in their free tier
        // VIX is a CBOE index that requires special data access
        console.warn(`Alpha Vantage does not support VIX data. Use Yahoo Finance as primary source.`);
        console.warn(`Requested date: ${date} - Returning null (graceful degradation)`);

        // Mark as unavailable since VIX is not supported
        this.isAvailable = false;

        return null;
    }

    /**
     * Fetch stock/ETF data from Alpha Vantage for a specific date
     * This can be used for other symbols if needed in the future
     * 
     * @param symbol Stock symbol (e.g., 'SPY', 'AAPL')
     * @param date Date in YYYY-MM-DD format
     * @returns Closing price for the specified date, or null if not available
     */
    async fetchSymbol(symbol: string, date: string): Promise<number | null> {
        // If API is marked as unavailable, return null immediately
        if (!this.isAvailable) {
            console.warn('Alpha Vantage API is currently unavailable. Skipping request.');
            return null;
        }

        return this.fetchWithRetry(async () => {
            await this.enforceRateLimit();

            const response = await axios.get<AlphaVantageResponse>(this.baseUrl, {
                params: {
                    function: 'TIME_SERIES_DAILY',
                    symbol: symbol,
                    apikey: this.apiKey,
                    outputsize: 'compact' // Last 100 data points
                },
                timeout: 10000 // 10 second timeout
            });

            this.requestCount++;

            // Check for rate limit message
            if (response.data['Note']) {
                console.warn('Alpha Vantage rate limit reached:', response.data['Note']);
                this.isAvailable = false; // Mark as unavailable
                return null;
            }

            // Check for error message
            if (response.data['Error Message']) {
                console.error('Alpha Vantage API error:', response.data['Error Message']);
                this.isAvailable = false; // Mark as unavailable
                return null;
            }

            // Check if time series data exists
            if (!response.data['Time Series (Daily)']) {
                console.warn(`No time series data available from Alpha Vantage for ${symbol}`);
                return null;
            }

            const timeSeries = response.data['Time Series (Daily)'];
            const dayData = timeSeries[date];

            if (!dayData) {
                console.warn(`No Alpha Vantage data available for ${symbol} on ${date}`);
                return null;
            }

            const closeValue = dayData['4. close'];

            if (!closeValue || closeValue === '') {
                console.warn(`Missing closing value for ${symbol} on ${date}`);
                return null;
            }

            const numericValue = parseFloat(closeValue);

            if (isNaN(numericValue) || !isFinite(numericValue)) {
                console.warn(`Invalid numeric value for ${symbol} on ${date}: ${closeValue}`);
                return null;
            }

            return numericValue;
        });
    }

    /**
     * Check if the Alpha Vantage API is currently available
     * @returns true if API is available, false otherwise
     */
    isApiAvailable(): boolean {
        return this.isAvailable;
    }

    /**
     * Reset the availability flag (useful for testing or manual recovery)
     */
    resetAvailability(): void {
        this.isAvailable = true;
        console.log('Alpha Vantage API availability reset');
    }

    /**
     * Enforce rate limiting (25 requests per day for free tier)
     * Adds delay if necessary to stay within rate limits
     */
    private async enforceRateLimit(): Promise<void> {
        const now = Date.now();
        const elapsed = now - this.requestWindowStart;

        // Reset counter if window has passed
        if (elapsed >= this.rateLimitWindow) {
            this.requestCount = 0;
            this.requestWindowStart = now;
            return;
        }

        // If we've hit the rate limit, mark as unavailable
        if (this.requestCount >= this.rateLimit) {
            const waitTime = this.rateLimitWindow - elapsed;
            console.warn(`Alpha Vantage rate limit reached (${this.rateLimit} requests per day). API unavailable for ${Math.round(waitTime / 3600000)} hours`);
            this.isAvailable = false;
            throw new Error('Alpha Vantage rate limit exceeded');
        }
    }

    /**
     * Retry logic with exponential backoff for network errors
     * Implements graceful degradation when API is unavailable
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

                // Check if this is a rate limit error
                if (this.isRateLimitError(error)) {
                    console.warn('Alpha Vantage rate limit error detected. Marking API as unavailable.');
                    this.isAvailable = false;
                    return null; // Graceful degradation
                }

                // Check if API is unavailable (timeout, connection refused, etc.)
                if (this.isApiUnavailableError(error)) {
                    console.warn('Alpha Vantage API appears to be unavailable:', this.getErrorMessage(error));
                    this.isAvailable = false;
                    return null; // Graceful degradation
                }

                // Handle retryable network errors
                if (this.isNetworkError(error)) {
                    if (isLastAttempt) {
                        console.error(`Alpha Vantage network error after ${this.maxRetries} attempts:`, this.getErrorMessage(error));
                        this.isAvailable = false; // Mark as unavailable after exhausting retries
                        return null; // Graceful degradation
                    }

                    const waitTime = this.calculateBackoff(attempt);
                    console.warn(`Alpha Vantage network error on attempt ${attempt + 1}. Retrying in ${waitTime}ms...`);
                    await this.sleep(waitTime);
                    continue;
                }

                // Non-retryable error - graceful degradation
                console.error('Alpha Vantage non-retryable error:', this.getErrorMessage(error));
                this.isAvailable = false;
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
     * Check if error is a rate limit error (429 or rate limit message)
     */
    private isRateLimitError(error: unknown): boolean {
        if (axios.isAxiosError(error)) {
            if (error.response?.status === 429) {
                return true;
            }
            // Check for Alpha Vantage specific rate limit message
            const data = error.response?.data as AlphaVantageResponse;
            if (data?.['Note']) {
                return true;
            }
        }
        if (error instanceof Error && error.message.includes('rate limit')) {
            return true;
        }
        return false;
    }

    /**
     * Check if error indicates API is unavailable (timeout, connection refused)
     */
    private isApiUnavailableError(error: unknown): boolean {
        if (axios.isAxiosError(error)) {
            return (
                error.code === 'ECONNABORTED' || // Timeout
                error.code === 'ETIMEDOUT' ||
                error.code === 'ECONNREFUSED' || // Connection refused
                error.code === 'ENOTFOUND' || // DNS lookup failed
                !error.response // No response received
            );
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
