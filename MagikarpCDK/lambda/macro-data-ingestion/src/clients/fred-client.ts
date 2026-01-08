/**
 * FRED API client for fetching economic data from the Federal Reserve Economic Data API
 * 
 * Supports fetching:
 * - GDP Growth Rate (A191RL1Q225SBEA)
 * - CPI (CPIAUCSL)
 * - Federal Funds Rate (DFF)
 * - 2-Year Treasury Yield (DGS2)
 * - 10-Year Treasury Yield (DGS10)
 * - ICE BofA BBB Corporate Bond Effective Yield (BAMLC0A4CBBBEY)
 * 
 * Rate Limit: 120 requests per minute
 */

import axios, { AxiosError } from 'axios';

interface FredObservation {
    date: string;
    value: string;
}

interface FredApiResponse {
    observations: FredObservation[];
}

export class FredApiClient {
    private readonly baseUrl = 'https://api.stlouisfed.org/fred/series/observations';
    private readonly maxRetries: number;
    private readonly retryBackoffBase: number;
    private requestCount = 0;
    private requestWindowStart = Date.now();
    private readonly rateLimit = 120; // requests per minute
    private readonly rateLimitWindow = 60000; // 1 minute in milliseconds

    constructor(
        private apiKey: string,
        maxRetries: number = 3,
        retryBackoffBase: number = 2.0
    ) {
        this.maxRetries = maxRetries;
        this.retryBackoffBase = retryBackoffBase;
    }

    /**
     * Fetch a data series from FRED API for a specific date
     * @param seriesId FRED series identifier (e.g., 'DFF' for Federal Funds Rate)
     * @param date Date in YYYY-MM-DD format
     * @returns The value for the specified date, or null if not available
     */
    async fetchSeries(seriesId: string, date: string): Promise<number | null> {
        return this.fetchWithRetry(async () => {
            await this.enforceRateLimit();

            const response = await axios.get<FredApiResponse>(this.baseUrl, {
                params: {
                    series_id: seriesId,
                    api_key: this.apiKey,
                    file_type: 'json',
                    observation_start: date,
                    observation_end: date
                },
                headers: {
                    'User-Agent': 'Magikarp-MacroData-Ingestion/1.0',
                    'Accept': 'application/json'
                }
            });

            this.requestCount++;

            if (!response.data.observations || response.data.observations.length === 0) {
                console.warn(`No data available for series ${seriesId} on ${date}`);
                return null;
            }

            const value = response.data.observations[0].value;

            // FRED returns '.' for missing values
            if (value === '.' || value === '') {
                console.warn(`Missing value for series ${seriesId} on ${date}`);
                return null;
            }

            const numericValue = parseFloat(value);

            if (isNaN(numericValue)) {
                console.warn(`Invalid numeric value for series ${seriesId} on ${date}: ${value}`);
                return null;
            }

            return numericValue;
        });
    }

    /**
     * Fetch GDP growth rate (quarterly, annualized)
     * Series: A191RL1Q225SBEA
     */
    async fetchGdpGrowth(date: string): Promise<number | null> {
        return this.fetchSeries('A191RL1Q225SBEA', date);
    }

    /**
     * Fetch Consumer Price Index (CPI)
     * Series: CPIAUCSL
     */
    async fetchCpi(date: string): Promise<number | null> {
        return this.fetchSeries('CPIAUCSL', date);
    }

    /**
     * Fetch Federal Funds Effective Rate
     * Series: DFF
     */
    async fetchFederalFundsRate(date: string): Promise<number | null> {
        return this.fetchSeries('DFF', date);
    }

    /**
     * Fetch 2-Year Treasury Constant Maturity Rate
     * Series: DGS2
     */
    async fetchTreasury2Year(date: string): Promise<number | null> {
        return this.fetchSeries('DGS2', date);
    }

    /**
     * Fetch 10-Year Treasury Constant Maturity Rate
     * Series: DGS10
     */
    async fetchTreasury10Year(date: string): Promise<number | null> {
        return this.fetchSeries('DGS10', date);
    }

    /**
     * Fetch ICE BofA BBB US Corporate Index Effective Yield
     * Series: BAMLC0A4CBBBEY
     */
    async fetchIceBofaBbb(date: string): Promise<number | null> {
        return this.fetchSeries('BAMLC0A4CBBBEY', date);
    }

    /**
     * Fetch FRED series data with automatic fallback to previous business days
     * 
     * @param seriesId FRED series identifier
     * @param targetDate Target date to fetch (typically previous business day)
     * @param maxAttempts Maximum number of previous business days to try (default: 5)
     * @returns Value or null if not found
     */
    async fetchSeriesWithFallback(
        seriesId: string,
        targetDate: string,
        maxAttempts: number = 5
    ): Promise<number | null> {
        const { getPreviousBusinessDays } = await import('../utils/market-calendar.js');

        // Try target date first, then previous business days
        const datesToTry = [targetDate, ...getPreviousBusinessDays(targetDate, maxAttempts - 1)];

        for (let i = 0; i < datesToTry.length; i++) {
            const dateToTry = datesToTry[i];
            const value = await this.fetchSeries(seriesId, dateToTry);

            if (value !== null) {
                if (i > 0) {
                    console.warn(`Using ${i}-day-old data for ${seriesId}: ${dateToTry}`);
                }
                return value;
            }
        }

        console.error(`No data found for ${seriesId} after ${maxAttempts} attempts`);
        return null;
    }

    /**
     * Enforce rate limiting (120 requests per minute)
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

        // If we've hit the rate limit, wait until the window resets
        if (this.requestCount >= this.rateLimit) {
            const waitTime = this.rateLimitWindow - elapsed;
            console.log(`Rate limit reached. Waiting ${waitTime}ms before next request`);
            await this.sleep(waitTime);
            this.requestCount = 0;
            this.requestWindowStart = Date.now();
        }
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

                if (this.is403Error(error)) {
                    console.error('403 Access Denied - API key may be invalid, blocked, or rate limited by WAF:', this.getErrorMessage(error));
                    console.error('Check: 1) API key validity, 2) IP not blocked, 3) Rate limits not exceeded');
                    return null;
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
     * Check if error is a 403 Forbidden error
     */
    private is403Error(error: unknown): boolean {
        if (axios.isAxiosError(error)) {
            return error.response?.status === 403;
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
