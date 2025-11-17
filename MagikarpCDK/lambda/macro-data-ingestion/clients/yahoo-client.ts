/**
 * Yahoo Finance client for fetching market data
 * 
 * Supports fetching:
 * - VIX (^VIX) - CBOE Volatility Index
 * - DXY (DX-Y.NYB) - US Dollar Index
 * 
 * Rate Limit: No official limit, but we add delays to be respectful
 * 
 * Note: Uses Yahoo Finance v8 API directly via axios for better compatibility
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
            };
        }>;
        error: any;
    };
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
