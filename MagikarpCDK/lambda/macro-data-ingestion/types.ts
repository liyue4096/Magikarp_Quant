/**
 * TypeScript interfaces and types for macro data ingestion
 */

export interface MacroIndicators {
    date: string;  // Partition key (YYYY-MM-DD)
    gdp_growth?: number;  // Quarterly, annualized %
    cpi: number;  // Index value
    cpi_yoy: number;  // % change
    interest_rate: number;  // %
    vix: number;  // Index value
    dxy: number;  // Index value
    treasury_2y: number;  // %
    treasury_10y: number;  // %
    yield_curve_spread: number;  // % points
    ice_bofa_bbb: number;  // %
    last_updated: string;  // ISO 8601 timestamp
}

export interface ValidationRule {
    min: number;
    max: number;
    required: boolean;
}

export interface ValidationResult {
    isValid: boolean;
    errors: string[];
}

export interface FetchResult {
    success: boolean;
    date: string;
    data?: MacroIndicators;
    errors?: string[];
}

export interface BackfillResult {
    successCount: number;
    failureCount: number;
    errors: string[];
}

export interface MacroDataConfig {
    fredApiKey: string;
    tableName: string;
    awsRegion: string;
    retryAttempts: number;
    retryBackoffBase: number;  // Exponential backoff base
}

/**
 * Validation rules for macroeconomic indicators
 * Defines acceptable ranges for each indicator to ensure data quality
 */
export const VALIDATION_RULES: Record<string, ValidationRule> = {
    gdp_growth: { min: -50, max: 50, required: false },  // Quarterly data, may not be available daily
    cpi: { min: 0, max: 1000, required: true },
    cpi_yoy: { min: -20, max: 50, required: true },
    interest_rate: { min: 0, max: 20, required: true },
    vix: { min: 0, max: 100, required: true },
    dxy: { min: 50, max: 200, required: true },
    treasury_2y: { min: 0, max: 20, required: true },
    treasury_10y: { min: 0, max: 20, required: true },
    yield_curve_spread: { min: -10, max: 10, required: true },
    ice_bofa_bbb: { min: 0, max: 30, required: true }
};
