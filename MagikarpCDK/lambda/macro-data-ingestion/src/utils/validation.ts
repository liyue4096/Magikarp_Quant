/**
 * Data validation module for macro indicators
 */

import { MacroIndicators, ValidationRule, ValidationResult } from '../types';

export const VALIDATION_RULES: Record<string, ValidationRule> = {
    gdp_growth: { min: -50, max: 50, required: false },  // Quarterly data
    cpi: { min: 0, max: 1000, required: false },  // Monthly data - may not be available for recent dates
    cpi_yoy: { min: -20, max: 50, required: false },  // Calculated from CPI - optional if CPI unavailable
    interest_rate: { min: 0, max: 20, required: true },
    vix: { min: 0, max: 100, required: true },
    dxy: { min: 50, max: 200, required: false },
    treasury_2y: { min: 0, max: 20, required: true },
    treasury_10y: { min: 0, max: 20, required: true },
    yield_curve_spread: { min: -10, max: 10, required: true },
    ice_bofa_bbb: { min: 0, max: 30, required: true }
};

/**
 * Validates that all numeric values in the data are valid (not NaN, not infinite, not null)
 * @param data MacroIndicators object to validate
 * @returns Array of error messages for invalid values
 */
function validateNumericValues(data: MacroIndicators): string[] {
    const errors: string[] = [];

    // Check each numeric field
    const numericFields: (keyof MacroIndicators)[] = [
        'gdp_growth', 'cpi', 'cpi_yoy', 'interest_rate', 'vix',
        'dxy', 'treasury_2y', 'treasury_10y', 'yield_curve_spread', 'ice_bofa_bbb'
    ];

    for (const field of numericFields) {
        const value = data[field];

        // Skip optional fields that are undefined or null
        if ((value === undefined || value === null) && !VALIDATION_RULES[field].required) {
            continue;
        }

        // Check for null on required fields
        if (value === null) {
            errors.push(`${field} is null`);
            continue;
        }

        // Check for undefined on required fields
        if (value === undefined) {
            errors.push(`${field} is undefined`);
            continue;
        }

        // Check for NaN
        if (typeof value === 'number' && isNaN(value)) {
            errors.push(`${field} is NaN`);
            continue;
        }

        // Check for infinite values
        if (typeof value === 'number' && !isFinite(value)) {
            errors.push(`${field} is infinite`);
            continue;
        }
    }

    return errors;
}

/**
 * Validates that all values are within acceptable ranges defined in VALIDATION_RULES
 * @param data MacroIndicators object to validate
 * @returns Array of error messages for out-of-range values
 */
export function validateRanges(data: MacroIndicators): string[] {
    const errors: string[] = [];

    for (const [field, rule] of Object.entries(VALIDATION_RULES)) {
        const value = data[field as keyof MacroIndicators];

        // Skip optional fields that are undefined or null
        if ((value === undefined || value === null) && !rule.required) {
            continue;
        }

        // Check if required field is missing
        if ((value === undefined || value === null) && rule.required) {
            errors.push(`Required field ${field} is missing`);
            continue;
        }

        // Validate range for numeric values
        if (typeof value === 'number' && isFinite(value)) {
            if (value < rule.min || value > rule.max) {
                errors.push(`${field} value ${value} is out of range [${rule.min}, ${rule.max}]`);
            }
        }
    }

    return errors;
}

/**
 * Validates date format (YYYY-MM-DD)
 * @param date Date string to validate
 * @returns Error message if invalid, null if valid
 */
function validateDateFormat(date: string): string | null {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

    if (!dateRegex.test(date)) {
        return `Date ${date} is not in YYYY-MM-DD format`;
    }

    // Additional check: ensure it's a valid date
    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
        return `Date ${date} is not a valid date`;
    }

    return null;
}

/**
 * Detects day-over-day changes greater than 50% and returns warnings
 * @param data Current day's data
 * @param previousData Previous day's data (optional)
 * @returns Array of warning messages for large changes
 */
export function detectLargeChanges(
    data: MacroIndicators,
    previousData?: MacroIndicators
): string[] {
    const warnings: string[] = [];

    if (!previousData) {
        return warnings;
    }

    const fieldsToCheck: (keyof MacroIndicators)[] = [
        'gdp_growth', 'cpi', 'cpi_yoy', 'interest_rate', 'vix',
        'dxy', 'treasury_2y', 'treasury_10y', 'yield_curve_spread', 'ice_bofa_bbb'
    ];

    for (const field of fieldsToCheck) {
        const currentValue = data[field];
        const previousValue = previousData[field];

        // Skip if either value is missing or not a number
        if (typeof currentValue !== 'number' || typeof previousValue !== 'number') {
            continue;
        }

        if (!isFinite(currentValue) || !isFinite(previousValue)) {
            continue;
        }

        // Skip if previous value is zero (avoid division by zero)
        if (previousValue === 0) {
            continue;
        }

        // Calculate percentage change
        const percentChange = Math.abs((currentValue - previousValue) / previousValue) * 100;

        if (percentChange > 50) {
            warnings.push(
                `${field} changed by ${percentChange.toFixed(2)}% from ${previousValue} to ${currentValue}`
            );
        }
    }

    return warnings;
}

/**
 * Comprehensive validation function that checks all data quality aspects
 * @param data MacroIndicators object to validate
 * @param previousData Optional previous day's data for change detection
 * @returns ValidationResult with isValid flag and array of errors/warnings
 */
export function validateData(
    data: MacroIndicators,
    previousData?: MacroIndicators
): ValidationResult {
    const errors: string[] = [];

    // 1. Validate date format (Requirement 3.3)
    const dateError = validateDateFormat(data.date);
    if (dateError) {
        errors.push(dateError);
    }

    // 2. Validate numeric values (NaN, infinite, null) (Requirement 3.1)
    const numericErrors = validateNumericValues(data);
    errors.push(...numericErrors);

    // 3. Validate ranges (Requirements 3.4, 3.5, 3.6, 3.7)
    const rangeErrors = validateRanges(data);
    errors.push(...rangeErrors);

    // 4. Check for missing required fields (Requirement 3.2)
    const missingFields: string[] = [];
    for (const [field, rule] of Object.entries(VALIDATION_RULES)) {
        if (rule.required) {
            const value = data[field as keyof MacroIndicators];
            if (value === undefined || value === null) {
                missingFields.push(field);
            }
        }
    }

    if (missingFields.length > 0) {
        errors.push(`Missing required fields: ${missingFields.join(', ')}`);
    }

    // 5. Detect large day-over-day changes (Requirement 3.9)
    if (previousData) {
        const changeWarnings = detectLargeChanges(data, previousData);
        // Add warnings as errors (they should be logged but not fail validation)
        errors.push(...changeWarnings.map(w => `WARNING: ${w}`));
    }

    return {
        isValid: errors.filter(e => !e.startsWith('WARNING:')).length === 0,
        errors: errors
    };
}
