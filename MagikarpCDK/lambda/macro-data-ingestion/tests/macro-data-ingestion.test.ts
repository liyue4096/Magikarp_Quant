/**
 * Unit tests for macro data ingestion Lambda function
 * 
 * Tests cover:
 * - FRED API client with mocked responses
 * - Yahoo Finance client with mocked responses
 * - CPI YoY calculation
 * - Yield curve spread calculation
 * - Validation rules with valid and invalid data
 * - Retry logic with simulated failures
 * 
 * Requirements: 3.1, 3.9, 6.1, 8.2
 */

import axios from 'axios';
import { FredApiClient } from '../clients/fred-client';
import { YahooFinanceClient } from '../clients/yahoo-client';
import { MacroDataIngestionService } from '../service';
import { validateData, validateRanges, detectLargeChanges, VALIDATION_RULES } from '../validation';
import { MacroIndicators, MacroDataConfig } from '../types';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock axios.isAxiosError
jest.spyOn(axios, 'isAxiosError');

describe('FredApiClient', () => {
    let client: FredApiClient;
    const mockApiKey = 'test-api-key';

    beforeEach(() => {
        client = new FredApiClient(mockApiKey, 3, 2.0);
        jest.clearAllMocks();
    });

    describe('fetchSeries', () => {
        it('should fetch data successfully from FRED API', async () => {
            // Requirement 6.1: Test successful API fetch
            const mockResponse = {
                data: {
                    observations: [
                        { date: '2024-01-15', value: '5.33' }
                    ]
                }
            };

            mockedAxios.get.mockResolvedValueOnce(mockResponse);

            const result = await client.fetchSeries('DFF', '2024-01-15');

            expect(result).toBe(5.33);
            expect(mockedAxios.get).toHaveBeenCalledWith(
                'https://api.stlouisfed.org/fred/series/observations',
                expect.objectContaining({
                    params: expect.objectContaining({
                        series_id: 'DFF',
                        api_key: mockApiKey,
                        observation_start: '2024-01-15',
                        observation_end: '2024-01-15'
                    })
                })
            );
        });

        it('should return null when no data is available', async () => {
            const mockResponse = {
                data: {
                    observations: []
                }
            };

            mockedAxios.get.mockResolvedValueOnce(mockResponse);

            const result = await client.fetchSeries('DFF', '2024-01-15');

            expect(result).toBeNull();
        });

        it('should return null when FRED returns missing value indicator', async () => {
            const mockResponse = {
                data: {
                    observations: [
                        { date: '2024-01-15', value: '.' }
                    ]
                }
            };

            mockedAxios.get.mockResolvedValueOnce(mockResponse);

            const result = await client.fetchSeries('DGS2', '2024-01-15');

            expect(result).toBeNull();
        });

        it('should retry on network error and succeed', async () => {
            // Requirement 6.1: Test retry logic with exponential backoff
            const networkError: any = new Error('Network error');
            networkError.code = 'ECONNABORTED';
            networkError.isAxiosError = true;

            const mockResponse = {
                data: {
                    observations: [
                        { date: '2024-01-15', value: '4.5' }
                    ]
                }
            };

            // Mock axios.isAxiosError to return true for network errors
            (axios.isAxiosError as jest.MockedFunction<typeof axios.isAxiosError>).mockReturnValue(true);

            mockedAxios.get
                .mockRejectedValueOnce(networkError)
                .mockResolvedValueOnce(mockResponse);

            const result = await client.fetchSeries('DFF', '2024-01-15');

            expect(result).toBe(4.5);
            expect(mockedAxios.get).toHaveBeenCalledTimes(2);
        });


        it('should return null after max retries on persistent network error', async () => {
            // Requirement 6.1: Test retry logic exhaustion
            const networkError: any = new Error('Network error');
            networkError.code = 'ETIMEDOUT';
            networkError.isAxiosError = true;

            // Mock axios.isAxiosError to return true for network errors
            (axios.isAxiosError as jest.MockedFunction<typeof axios.isAxiosError>).mockReturnValue(true);

            mockedAxios.get.mockRejectedValue(networkError);

            const result = await client.fetchSeries('DFF', '2024-01-15');

            expect(result).toBeNull();
            expect(mockedAxios.get).toHaveBeenCalledTimes(3); // maxRetries = 3
        });

        it('should handle rate limit error (429) with retry', async () => {
            // Requirement 6.1: Test rate limit handling
            const rateLimitError: any = new Error('Rate limit exceeded');
            rateLimitError.response = {
                status: 429,
                headers: { 'retry-after': '1' }
            };
            rateLimitError.isAxiosError = true;

            const mockResponse = {
                data: {
                    observations: [
                        { date: '2024-01-15', value: '3.5' }
                    ]
                }
            };

            // Mock axios.isAxiosError to return true for our error
            (axios.isAxiosError as jest.MockedFunction<typeof axios.isAxiosError>).mockReturnValue(true);

            mockedAxios.get
                .mockRejectedValueOnce(rateLimitError)
                .mockResolvedValueOnce(mockResponse);

            const result = await client.fetchSeries('DFF', '2024-01-15');

            expect(result).toBe(3.5);
            expect(mockedAxios.get).toHaveBeenCalledTimes(2);
        });
    });

    describe('specific series methods', () => {
        it('should fetch GDP growth rate', async () => {
            const mockResponse = {
                data: {
                    observations: [
                        { date: '2024-01-01', value: '2.5' }
                    ]
                }
            };

            mockedAxios.get.mockResolvedValueOnce(mockResponse);

            const result = await client.fetchGdpGrowth('2024-01-01');

            expect(result).toBe(2.5);
            expect(mockedAxios.get).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    params: expect.objectContaining({
                        series_id: 'A191RL1Q225SBEA'
                    })
                })
            );
        });


        it('should fetch CPI', async () => {
            const mockResponse = {
                data: {
                    observations: [
                        { date: '2024-01-01', value: '308.417' }
                    ]
                }
            };

            mockedAxios.get.mockResolvedValueOnce(mockResponse);

            const result = await client.fetchCpi('2024-01-01');

            expect(result).toBe(308.417);
        });

        it('should fetch Federal Funds Rate', async () => {
            const mockResponse = {
                data: {
                    observations: [
                        { date: '2024-01-15', value: '5.33' }
                    ]
                }
            };

            mockedAxios.get.mockResolvedValueOnce(mockResponse);

            const result = await client.fetchFederalFundsRate('2024-01-15');

            expect(result).toBe(5.33);
        });

        it('should fetch Treasury yields', async () => {
            const mock2YResponse = {
                data: {
                    observations: [
                        { date: '2024-01-15', value: '4.25' }
                    ]
                }
            };

            const mock10YResponse = {
                data: {
                    observations: [
                        { date: '2024-01-15', value: '4.15' }
                    ]
                }
            };

            mockedAxios.get
                .mockResolvedValueOnce(mock2YResponse)
                .mockResolvedValueOnce(mock10YResponse);

            const treasury2y = await client.fetchTreasury2Year('2024-01-15');
            const treasury10y = await client.fetchTreasury10Year('2024-01-15');

            expect(treasury2y).toBe(4.25);
            expect(treasury10y).toBe(4.15);
        });
    });
});


describe('YahooFinanceClient', () => {
    let client: YahooFinanceClient;

    beforeEach(() => {
        client = new YahooFinanceClient(3, 2.0, 0); // No delay for tests
        jest.clearAllMocks();
    });

    describe('fetchClosingPrice', () => {
        it('should fetch closing price successfully', async () => {
            const mockResponse = {
                data: {
                    chart: {
                        result: [{
                            timestamp: [1705276800],
                            indicators: {
                                quote: [{
                                    open: [14.5],
                                    high: [15.2],
                                    low: [14.3],
                                    close: [14.8],
                                    volume: [1000000]
                                }]
                            }
                        }],
                        error: null
                    }
                }
            };

            mockedAxios.get.mockResolvedValueOnce(mockResponse);

            const result = await client.fetchClosingPrice('^VIX', '2024-01-15');

            expect(result).toBe(14.8);
            expect(mockedAxios.get).toHaveBeenCalledWith(
                expect.stringContaining('^VIX'),
                expect.objectContaining({
                    params: expect.objectContaining({
                        interval: '1d'
                    })
                })
            );
        });

        it('should return null when no data is available', async () => {
            const mockResponse = {
                data: {
                    chart: {
                        result: [],
                        error: null
                    }
                }
            };

            mockedAxios.get.mockResolvedValueOnce(mockResponse);

            const result = await client.fetchClosingPrice('^VIX', '2024-01-15');

            expect(result).toBeNull();
        });

        it('should warn about stale data when volume is zero', async () => {
            const mockResponse = {
                data: {
                    chart: {
                        result: [{
                            timestamp: [1705276800],
                            indicators: {
                                quote: [{
                                    open: [14.5],
                                    high: [15.2],
                                    low: [14.3],
                                    close: [14.8],
                                    volume: [0]  // Zero volume indicates stale data
                                }]
                            }
                        }],
                        error: null
                    }
                }
            };

            mockedAxios.get.mockResolvedValueOnce(mockResponse);

            const result = await client.fetchClosingPrice('^VIX', '2024-01-15');

            expect(result).toBe(14.8);
        });


        it('should retry on network error', async () => {
            const networkError = new Error('Network error');
            (networkError as any).code = 'ECONNABORTED';

            const mockResponse = {
                data: {
                    chart: {
                        result: [{
                            timestamp: [1705276800],
                            indicators: {
                                quote: [{
                                    open: [14.5],
                                    high: [15.2],
                                    low: [14.3],
                                    close: [14.8],
                                    volume: [1000000]
                                }]
                            }
                        }],
                        error: null
                    }
                }
            };

            mockedAxios.get
                .mockRejectedValueOnce(networkError)
                .mockResolvedValueOnce(mockResponse);

            const result = await client.fetchClosingPrice('^VIX', '2024-01-15');

            expect(result).toBe(14.8);
            expect(mockedAxios.get).toHaveBeenCalledTimes(2);
        });
    });

    describe('specific ticker methods', () => {
        it('should fetch VIX data', async () => {
            const mockResponse = {
                data: {
                    chart: {
                        result: [{
                            timestamp: [1705276800],
                            indicators: {
                                quote: [{
                                    open: [14.5],
                                    high: [15.2],
                                    low: [14.3],
                                    close: [14.8],
                                    volume: [1000000]
                                }]
                            }
                        }],
                        error: null
                    }
                }
            };

            mockedAxios.get.mockResolvedValueOnce(mockResponse);

            const result = await client.fetchVix('2024-01-15');

            expect(result).toBe(14.8);
        });

        it('should fetch DXY data', async () => {
            const mockResponse = {
                data: {
                    chart: {
                        result: [{
                            timestamp: [1705276800],
                            indicators: {
                                quote: [{
                                    open: [103.5],
                                    high: [104.2],
                                    low: [103.3],
                                    close: [103.8],
                                    volume: [1000]
                                }]
                            }
                        }],
                        error: null
                    }
                }
            };

            mockedAxios.get.mockResolvedValueOnce(mockResponse);

            const result = await client.fetchDxy('2024-01-15');

            expect(result).toBe(103.8);
        });
    });
});


describe('MacroDataIngestionService', () => {
    let service: MacroDataIngestionService;
    const mockConfig: MacroDataConfig = {
        fredApiKey: 'test-fred-key',
        tableName: 'test-macro-indicators',
        awsRegion: 'us-west-2',
        retryAttempts: 3,
        retryBackoffBase: 2.0
    };

    beforeEach(() => {
        service = new MacroDataIngestionService(mockConfig);
        jest.clearAllMocks();
    });

    describe('calculateCpiYoy', () => {
        it('should calculate year-over-year CPI change correctly', async () => {
            // Mock FRED API responses for CPI
            const currentCpi = 308.417;
            const previousYearCpi = 300.536;

            const mockPreviousYearResponse = {
                data: {
                    observations: [
                        { date: '2023-01-15', value: previousYearCpi.toString() }
                    ]
                }
            };

            mockedAxios.get.mockResolvedValueOnce(mockPreviousYearResponse);

            // Access private method via type assertion
            const calculateCpiYoy = (service as any).calculateCpiYoy.bind(service);
            const result = await calculateCpiYoy(currentCpi, '2024-01-15');

            // Expected: ((308.417 - 300.536) / 300.536) * 100 = 2.62%
            expect(result).toBeCloseTo(2.62, 1);
        });

        it('should return null when previous year CPI is not available', async () => {
            const mockResponse = {
                data: {
                    observations: []
                }
            };

            mockedAxios.get.mockResolvedValueOnce(mockResponse);

            const calculateCpiYoy = (service as any).calculateCpiYoy.bind(service);
            const result = await calculateCpiYoy(308.417, '2024-01-15');

            expect(result).toBeNull();
        });

        it('should return null when previous year CPI is zero', async () => {
            const mockResponse = {
                data: {
                    observations: [
                        { date: '2023-01-15', value: '0' }
                    ]
                }
            };

            mockedAxios.get.mockResolvedValueOnce(mockResponse);

            const calculateCpiYoy = (service as any).calculateCpiYoy.bind(service);
            const result = await calculateCpiYoy(308.417, '2024-01-15');

            expect(result).toBeNull();
        });
    });

    describe('calculateYieldSpread', () => {
        it('should calculate yield curve spread correctly', () => {
            const calculateYieldSpread = (service as any).calculateYieldSpread.bind(service);

            // Normal yield curve (10y > 2y)
            expect(calculateYieldSpread(4.15, 4.25)).toBeCloseTo(-0.10, 2);

            // Inverted yield curve (10y < 2y)
            expect(calculateYieldSpread(3.85, 4.25)).toBeCloseTo(-0.40, 2);

            // Flat yield curve
            expect(calculateYieldSpread(4.00, 4.00)).toBeCloseTo(0.00, 2);

            // Steep yield curve
            expect(calculateYieldSpread(5.00, 3.00)).toBeCloseTo(2.00, 2);
        });
    });
});


describe('Validation', () => {
    describe('validateRanges', () => {
        it('should pass validation for valid data', () => {
            // Requirement 3.1: Test validation with valid data
            const validData: MacroIndicators = {
                date: '2024-01-15',
                gdp_growth: 2.5,
                cpi: 308.417,
                cpi_yoy: 3.4,
                interest_rate: 5.33,
                vix: 14.8,
                dxy: 103.8,
                treasury_2y: 4.25,
                treasury_10y: 4.15,
                yield_curve_spread: -0.10,
                ice_bofa_bbb: 5.5,
                last_updated: '2024-01-15T12:00:00Z'
            };

            const errors = validateRanges(validData);

            expect(errors).toHaveLength(0);
        });

        it('should detect out-of-range VIX values', () => {
            // Requirement 3.5: VIX validation (0-100)
            const invalidData: MacroIndicators = {
                date: '2024-01-15',
                cpi: 308.417,
                cpi_yoy: 3.4,
                interest_rate: 5.33,
                vix: 150,  // Out of range
                dxy: 103.8,
                treasury_2y: 4.25,
                treasury_10y: 4.15,
                yield_curve_spread: -0.10,
                ice_bofa_bbb: 5.5,
                last_updated: '2024-01-15T12:00:00Z'
            };

            const errors = validateRanges(invalidData);

            expect(errors.length).toBeGreaterThan(0);
            expect(errors.some(e => e.includes('vix'))).toBe(true);
            expect(errors.some(e => e.includes('out of range'))).toBe(true);
        });

        it('should detect out-of-range DXY values', () => {
            // Requirement 3.6: DXY validation (50-200)
            const invalidData: MacroIndicators = {
                date: '2024-01-15',
                cpi: 308.417,
                cpi_yoy: 3.4,
                interest_rate: 5.33,
                vix: 14.8,
                dxy: 250,  // Out of range
                treasury_2y: 4.25,
                treasury_10y: 4.15,
                yield_curve_spread: -0.10,
                ice_bofa_bbb: 5.5,
                last_updated: '2024-01-15T12:00:00Z'
            };

            const errors = validateRanges(invalidData);

            expect(errors.length).toBeGreaterThan(0);
            expect(errors.some(e => e.includes('dxy'))).toBe(true);
        });

        it('should detect out-of-range Treasury yields', () => {
            // Requirement 3.7: Treasury yields validation (0-20%)
            const invalidData: MacroIndicators = {
                date: '2024-01-15',
                cpi: 308.417,
                cpi_yoy: 3.4,
                interest_rate: 5.33,
                vix: 14.8,
                dxy: 103.8,
                treasury_2y: 25,  // Out of range
                treasury_10y: 4.15,
                yield_curve_spread: -0.10,
                ice_bofa_bbb: 5.5,
                last_updated: '2024-01-15T12:00:00Z'
            };

            const errors = validateRanges(invalidData);

            expect(errors.length).toBeGreaterThan(0);
            expect(errors.some(e => e.includes('treasury_2y'))).toBe(true);
        });


        it('should detect out-of-range percentage values', () => {
            // Requirement 3.4: Percentage values validation (-100 to 1000)
            const invalidData: MacroIndicators = {
                date: '2024-01-15',
                cpi: 308.417,
                cpi_yoy: 1500,  // Out of range
                interest_rate: 5.33,
                vix: 14.8,
                dxy: 103.8,
                treasury_2y: 4.25,
                treasury_10y: 4.15,
                yield_curve_spread: -0.10,
                ice_bofa_bbb: 5.5,
                last_updated: '2024-01-15T12:00:00Z'
            };

            const errors = validateRanges(invalidData);

            expect(errors.length).toBeGreaterThan(0);
            expect(errors.some(e => e.includes('cpi_yoy'))).toBe(true);
        });

        it('should allow optional GDP growth to be undefined', () => {
            const validData: MacroIndicators = {
                date: '2024-01-15',
                // gdp_growth is optional and undefined
                cpi: 308.417,
                cpi_yoy: 3.4,
                interest_rate: 5.33,
                vix: 14.8,
                dxy: 103.8,
                treasury_2y: 4.25,
                treasury_10y: 4.15,
                yield_curve_spread: -0.10,
                ice_bofa_bbb: 5.5,
                last_updated: '2024-01-15T12:00:00Z'
            };

            const errors = validateRanges(validData);

            expect(errors).toHaveLength(0);
        });

        it('should detect missing required fields', () => {
            const invalidData: MacroIndicators = {
                date: '2024-01-15',
                cpi: 308.417,
                cpi_yoy: 3.4,
                interest_rate: 5.33,
                // vix is missing (required)
                dxy: 103.8,
                treasury_2y: 4.25,
                treasury_10y: 4.15,
                yield_curve_spread: -0.10,
                ice_bofa_bbb: 5.5,
                last_updated: '2024-01-15T12:00:00Z'
            } as MacroIndicators;

            const errors = validateRanges(invalidData);

            expect(errors.length).toBeGreaterThan(0);
            expect(errors.some(e => e.includes('vix') && e.includes('missing'))).toBe(true);
        });
    });

    describe('validateData', () => {
        it('should validate date format', () => {
            // Requirement 3.3: Date format validation
            const invalidData: MacroIndicators = {
                date: '01/15/2024',  // Invalid format
                cpi: 308.417,
                cpi_yoy: 3.4,
                interest_rate: 5.33,
                vix: 14.8,
                dxy: 103.8,
                treasury_2y: 4.25,
                treasury_10y: 4.15,
                yield_curve_spread: -0.10,
                ice_bofa_bbb: 5.5,
                last_updated: '2024-01-15T12:00:00Z'
            };

            const result = validateData(invalidData);

            expect(result.isValid).toBe(false);
            expect(result.errors.some(e => e.includes('YYYY-MM-DD'))).toBe(true);
        });


        it('should detect NaN values', () => {
            // Requirement 3.1: Validate numeric values (not NaN)
            const invalidData: MacroIndicators = {
                date: '2024-01-15',
                cpi: NaN,  // Invalid
                cpi_yoy: 3.4,
                interest_rate: 5.33,
                vix: 14.8,
                dxy: 103.8,
                treasury_2y: 4.25,
                treasury_10y: 4.15,
                yield_curve_spread: -0.10,
                ice_bofa_bbb: 5.5,
                last_updated: '2024-01-15T12:00:00Z'
            };

            const result = validateData(invalidData);

            expect(result.isValid).toBe(false);
            expect(result.errors.some(e => e.includes('cpi') && e.includes('NaN'))).toBe(true);
        });

        it('should detect infinite values', () => {
            // Requirement 3.1: Validate numeric values (not infinite)
            const invalidData: MacroIndicators = {
                date: '2024-01-15',
                cpi: 308.417,
                cpi_yoy: 3.4,
                interest_rate: Infinity,  // Invalid
                vix: 14.8,
                dxy: 103.8,
                treasury_2y: 4.25,
                treasury_10y: 4.15,
                yield_curve_spread: -0.10,
                ice_bofa_bbb: 5.5,
                last_updated: '2024-01-15T12:00:00Z'
            };

            const result = validateData(invalidData);

            expect(result.isValid).toBe(false);
            expect(result.errors.some(e => e.includes('interest_rate') && e.includes('infinite'))).toBe(true);
        });
    });

    describe('detectLargeChanges', () => {
        it('should detect day-over-day changes greater than 50%', () => {
            // Requirement 3.9: Detect large day-over-day changes
            const currentData: MacroIndicators = {
                date: '2024-01-16',
                cpi: 308.417,
                cpi_yoy: 3.4,
                interest_rate: 5.33,
                vix: 30.0,  // Large spike from 15.0
                dxy: 103.8,
                treasury_2y: 4.25,
                treasury_10y: 4.15,
                yield_curve_spread: -0.10,
                ice_bofa_bbb: 5.5,
                last_updated: '2024-01-16T12:00:00Z'
            };

            const previousData: MacroIndicators = {
                date: '2024-01-15',
                cpi: 308.417,
                cpi_yoy: 3.4,
                interest_rate: 5.33,
                vix: 15.0,  // Previous value
                dxy: 103.8,
                treasury_2y: 4.25,
                treasury_10y: 4.15,
                yield_curve_spread: -0.10,
                ice_bofa_bbb: 5.5,
                last_updated: '2024-01-15T12:00:00Z'
            };

            const warnings = detectLargeChanges(currentData, previousData);

            expect(warnings.length).toBeGreaterThan(0);
            expect(warnings.some(w => w.includes('vix'))).toBe(true);
            expect(warnings.some(w => w.includes('100.00%'))).toBe(true);
        });


        it('should not warn for changes less than 50%', () => {
            const currentData: MacroIndicators = {
                date: '2024-01-16',
                cpi: 308.417,
                cpi_yoy: 3.4,
                interest_rate: 5.33,
                vix: 18.0,  // 20% increase from 15.0
                dxy: 103.8,
                treasury_2y: 4.25,
                treasury_10y: 4.15,
                yield_curve_spread: -0.10,
                ice_bofa_bbb: 5.5,
                last_updated: '2024-01-16T12:00:00Z'
            };

            const previousData: MacroIndicators = {
                date: '2024-01-15',
                cpi: 308.417,
                cpi_yoy: 3.4,
                interest_rate: 5.33,
                vix: 15.0,
                dxy: 103.8,
                treasury_2y: 4.25,
                treasury_10y: 4.15,
                yield_curve_spread: -0.10,
                ice_bofa_bbb: 5.5,
                last_updated: '2024-01-15T12:00:00Z'
            };

            const warnings = detectLargeChanges(currentData, previousData);

            expect(warnings).toHaveLength(0);
        });

        it('should return empty array when no previous data is provided', () => {
            const currentData: MacroIndicators = {
                date: '2024-01-16',
                cpi: 308.417,
                cpi_yoy: 3.4,
                interest_rate: 5.33,
                vix: 30.0,
                dxy: 103.8,
                treasury_2y: 4.25,
                treasury_10y: 4.15,
                yield_curve_spread: -0.10,
                ice_bofa_bbb: 5.5,
                last_updated: '2024-01-16T12:00:00Z'
            };

            const warnings = detectLargeChanges(currentData);

            expect(warnings).toHaveLength(0);
        });

        it('should handle zero previous values gracefully', () => {
            const currentData: MacroIndicators = {
                date: '2024-01-16',
                cpi: 308.417,
                cpi_yoy: 3.4,
                interest_rate: 5.33,
                vix: 15.0,
                dxy: 103.8,
                treasury_2y: 4.25,
                treasury_10y: 4.15,
                yield_curve_spread: -0.10,
                ice_bofa_bbb: 5.5,
                last_updated: '2024-01-16T12:00:00Z'
            };

            const previousData: MacroIndicators = {
                date: '2024-01-15',
                cpi: 308.417,
                cpi_yoy: 3.4,
                interest_rate: 5.33,
                vix: 0,  // Zero value
                dxy: 103.8,
                treasury_2y: 4.25,
                treasury_10y: 4.15,
                yield_curve_spread: -0.10,
                ice_bofa_bbb: 5.5,
                last_updated: '2024-01-15T12:00:00Z'
            };

            const warnings = detectLargeChanges(currentData, previousData);

            // Should not throw error or warn about division by zero
            expect(warnings.some(w => w.includes('vix'))).toBe(false);
        });
    });

    describe('VALIDATION_RULES', () => {
        it('should have correct validation rules defined', () => {
            expect(VALIDATION_RULES.vix).toEqual({ min: 0, max: 100, required: true });
            expect(VALIDATION_RULES.dxy).toEqual({ min: 50, max: 200, required: true });
            expect(VALIDATION_RULES.treasury_2y).toEqual({ min: 0, max: 20, required: true });
            expect(VALIDATION_RULES.treasury_10y).toEqual({ min: 0, max: 20, required: true });
            expect(VALIDATION_RULES.gdp_growth).toEqual({ min: -50, max: 50, required: false });
        });
    });
});
