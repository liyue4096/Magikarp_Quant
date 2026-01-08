/**
 * TypeScript interfaces and types for macro data ingestion
 */

export interface MacroIndicators {
    date: string;  // Partition key (YYYY-MM-DD)
    gdp_growth?: number;  // Quarterly, annualized %
    cpi?: number;  // Index value
    cpi_yoy?: number;  // % change
    interest_rate: number;  // %
    vix: number;  // Index value
    dxy?: number;  // Index value
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
