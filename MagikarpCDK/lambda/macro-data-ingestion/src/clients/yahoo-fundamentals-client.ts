/**
 * Yahoo Finance Fundamentals Client
 *
 * Fetches fundamental data (P/E, P/S, P/B, etc.) using Yahoo Finance API
 * with proper crumb authentication.
 *
 * Yahoo Finance requires a "crumb" token for API access. This client:
 * 1. Fetches initial cookies from Yahoo Finance
 * 2. Extracts the crumb token
 * 3. Uses both for authenticated API requests
 */

import axios, { AxiosInstance } from 'axios';
import * as tough from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';

interface YahooFundamentalsResponse {
    quoteSummary: {
        result: Array<{
            summaryDetail?: {
                trailingPE?: { raw?: number };
                forwardPE?: { raw?: number };
                beta?: { raw?: number };
                marketCap?: { raw?: number };
                dividendYield?: { raw?: number };
                dividendRate?: { raw?: number };
                payoutRatio?: { raw?: number };
                priceToSalesTrailing12Months?: { raw?: number };
            };
            defaultKeyStatistics?: {
                priceToBook?: { raw?: number };
                pegRatio?: { raw?: number };
                enterpriseValue?: { raw?: number };
                trailingEps?: { raw?: number };
                bookValue?: { raw?: number };
                enterpriseToRevenue?: { raw?: number };
                enterpriseToEbitda?: { raw?: number };
            };
            financialData?: {
                profitMargins?: { raw?: number };
                operatingMargins?: { raw?: number };
                returnOnEquity?: { raw?: number };
                returnOnAssets?: { raw?: number };
                debtToEquity?: { raw?: number };
                currentRatio?: { raw?: number };
                quickRatio?: { raw?: number };
                revenuePerShare?: { raw?: number };
                revenueGrowth?: { raw?: number };
                earningsGrowth?: { raw?: number };
            };
        }>;
        error: any;
    };
}

export interface StockFundamentals {
    symbol: string;
    // Valuation Ratios
    peRatio: number | null;
    forwardPE: number | null;
    pbRatio: number | null;
    psRatio: number | null;
    pegRatio: number | null;
    // Market Data
    marketCap: number | null;
    enterpriseValue: number | null;
    beta: number | null;
    // Profitability
    profitMargin: number | null;
    operatingMargin: number | null;
    returnOnEquity: number | null;
    returnOnAssets: number | null;
    // Financial Health
    debtToEquity: number | null;
    currentRatio: number | null;
    quickRatio: number | null;
    // Per Share Data
    eps: number | null;
    revenuePerShare: number | null;
    bookValuePerShare: number | null;
    // Dividend Data
    dividendYield: number | null;
    dividendRate: number | null;
    payoutRatio: number | null;
    // Growth Metrics
    revenueGrowth: number | null;
    earningsGrowth: number | null;
    // Additional Ratios
    evToRevenue: number | null;
    evToEbitda: number | null;
    // Timestamp
    lastUpdated: string;
}

export class YahooFundamentalsClient {
    private crumb: string | null = null;
    private cookieJar: tough.CookieJar;
    private client: AxiosInstance;
    private crumbExpiry: number = 0;
    private readonly crumbTTL = 3600000; // 1 hour

    constructor() {
        this.cookieJar = new tough.CookieJar();
        this.client = wrapper(axios.create({
            jar: this.cookieJar,
            withCredentials: true,
            headers: {
                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            }
        }));
    }

    /**
     * Fetch and cache the crumb token
     */
    private async getCrumb(): Promise<string> {
        // Return cached crumb if still valid
        if (this.crumb && Date.now() < this.crumbExpiry) {
            return this.crumb;
        }

        try {
            // Step 1: Get cookies by visiting Yahoo Finance
            const response = await this.client.get('https://finance.yahoo.com/quote/AAPL');

            // Step 2: Extract crumb from HTML response
            const html = response.data;

            // Try multiple patterns to extract crumb
            const patterns = [
                /"CrumbStore":\{"crumb":"([^"]+)"\}/,
                /"crumb":"([^"]+)"/,
                /CrumbStore.*?crumb.*?"([^"]+)"/
            ];

            for (const pattern of patterns) {
                const match = html.match(pattern);
                if (match && match[1]) {
                    const extractedCrumb = match[1];
                    this.crumb = extractedCrumb;
                    this.crumbExpiry = Date.now() + this.crumbTTL;
                    console.log('Successfully obtained crumb');
                    return extractedCrumb;
                }
            }

            throw new Error('Could not extract crumb from Yahoo Finance response');

        } catch (error) {
            console.error('Failed to get crumb:', error);
            throw new Error('Failed to authenticate with Yahoo Finance');
        }
    }

    /**
     * Fetch fundamental data for a stock
     */
    async fetchFundamentals(symbol: string): Promise<StockFundamentals | null> {
        try {
            // Get crumb (will use cached if available)
            const crumb = await this.getCrumb();

            // Make API request with crumb
            const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}`;

            const response = await this.client.get<YahooFundamentalsResponse>(url, {
                params: {
                    modules: 'summaryDetail,defaultKeyStatistics,financialData',
                    crumb: crumb
                }
            });

            if (!response.data.quoteSummary || !response.data.quoteSummary.result || response.data.quoteSummary.result.length === 0) {
                console.warn(`No fundamental data available for ${symbol}`);
                return null;
            }

            const result = response.data.quoteSummary.result[0];
            const summaryDetail = result.summaryDetail;
            const keyStats = result.defaultKeyStatistics;
            const financialData = result.financialData;

            // Helper to safely extract raw values
            const getRaw = (obj: any): number | null => {
                return obj?.raw !== undefined && obj.raw !== null ? obj.raw : null;
            };

            return {
                symbol: symbol.toUpperCase(),

                // Valuation Ratios
                peRatio: getRaw(summaryDetail?.trailingPE),
                forwardPE: getRaw(summaryDetail?.forwardPE),
                pbRatio: getRaw(keyStats?.priceToBook),
                psRatio: getRaw(summaryDetail?.priceToSalesTrailing12Months),
                pegRatio: getRaw(keyStats?.pegRatio),

                // Market Data
                marketCap: getRaw(summaryDetail?.marketCap),
                enterpriseValue: getRaw(keyStats?.enterpriseValue),
                beta: getRaw(summaryDetail?.beta),

                // Profitability
                profitMargin: getRaw(financialData?.profitMargins),
                operatingMargin: getRaw(financialData?.operatingMargins),
                returnOnEquity: getRaw(financialData?.returnOnEquity),
                returnOnAssets: getRaw(financialData?.returnOnAssets),

                // Financial Health
                debtToEquity: getRaw(financialData?.debtToEquity),
                currentRatio: getRaw(financialData?.currentRatio),
                quickRatio: getRaw(financialData?.quickRatio),

                // Per Share Data
                eps: getRaw(keyStats?.trailingEps),
                revenuePerShare: getRaw(financialData?.revenuePerShare),
                bookValuePerShare: getRaw(keyStats?.bookValue),

                // Dividend Data
                dividendYield: getRaw(summaryDetail?.dividendYield),
                dividendRate: getRaw(summaryDetail?.dividendRate),
                payoutRatio: getRaw(summaryDetail?.payoutRatio),

                // Growth Metrics
                revenueGrowth: getRaw(financialData?.revenueGrowth),
                earningsGrowth: getRaw(financialData?.earningsGrowth),

                // Additional Ratios
                evToRevenue: getRaw(keyStats?.enterpriseToRevenue),
                evToEbitda: getRaw(keyStats?.enterpriseToEbitda),

                // Timestamp
                lastUpdated: new Date().toISOString()
            };

        } catch (error: any) {
            if (axios.isAxiosError(error)) {
                console.error(`Failed to fetch fundamentals for ${symbol}:`, error.message);
                if (error.response) {
                    console.error('Response:', error.response.data);
                }
            } else {
                console.error(`Unexpected error fetching fundamentals for ${symbol}:`, error);
            }
            return null;
        }
    }
}
