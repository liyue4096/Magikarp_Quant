/**
 * Lambda handler for macro data ingestion
 * 
 * This Lambda function handles two types of operations:
 * 1. Daily fetch: Fetches macro data for a specific date (or current date if not specified)
 * 2. Backfill: Fetches historical data for a date range
 * 
 * Requirements: 7.1, 7.2, 7.3, 9.1, 9.2, 9.3, 9.4, 9.5
 */

import { MacroDataIngestionService } from './service';
import { getMostRecentTradingDay } from './market-calendar';
import { FetchResult, BackfillResult } from './types';

// Default start date for backfill: January 3, 2000 (first trading day of Y2K)
const DEFAULT_BACKFILL_START_DATE = '2000-01-03';

/**
 * Lambda handler function
 * 
 * Event structure:
 * - For daily fetch: { date?: string } or empty event {}
 * - For backfill: { action: 'backfill', startDate?: string, endDate?: string }
 * 
 * @param event Lambda event object
 * @returns FetchResult or BackfillResult in Lambda-compatible format
 */
export async function handler(event: any): Promise<FetchResult | BackfillResult> {
    // Log invocation details for debugging
    console.log('Macro data ingestion Lambda invoked');
    console.log('Event:', JSON.stringify(event, null, 2));
    console.log('Environment:', {
        tableName: process.env.MACRO_INDICATORS_TABLE,
        region: process.env.AWS_REGION,
        hasFredApiKey: !!process.env.FRED_API_KEY
    });

    try {
        // Instantiate MacroDataIngestionService (Requirements 9.1, 9.2, 9.3, 9.4, 9.5)
        // Service will load configuration from environment variables
        const service = new MacroDataIngestionService();

        // Check event.action to determine if daily fetch or backfill (Requirement 7.1, 7.2)
        if (event.action === 'backfill') {
            // Backfill operation: use event.startDate and event.endDate (Requirement 7.2)
            const startDate = event.startDate || DEFAULT_BACKFILL_START_DATE;
            const endDate = event.endDate || getMostRecentTradingDay();

            console.log(`Starting backfill operation from ${startDate} to ${endDate}`);

            // Call backfill method and return result
            const result = await service.backfill(startDate, endDate);

            console.log('Backfill operation completed');
            console.log(`Success: ${result.successCount}, Failures: ${result.failureCount}`);

            // Return result in Lambda-compatible format
            return result;

        } else {
            // Daily fetch operation: use event.date or current date (Requirement 7.1)
            const date = event.date || getMostRecentTradingDay();

            console.log(`Starting daily fetch operation for ${date}`);

            // Call fetchDailyData method and return result
            const result = await service.fetchDailyData(date);

            if (result.success) {
                console.log(`Daily fetch operation completed successfully for ${date}`);
            } else {
                console.error(`Daily fetch operation failed for ${date}:`, result.errors);
            }

            // Return result in Lambda-compatible format
            return result;
        }

    } catch (error) {
        // Error handling and logging (Requirement 7.3)
        console.error('Lambda handler error:', error);

        // Extract error message
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;

        // Log detailed error information
        console.error('Error details:', {
            message: errorMessage,
            stack: errorStack,
            event: JSON.stringify(event)
        });

        // Return error result in Lambda-compatible format
        // Determine if this was a backfill or daily fetch operation
        if (event.action === 'backfill') {
            return {
                successCount: 0,
                failureCount: 0,
                errors: [`Lambda handler error: ${errorMessage}`]
            } as BackfillResult;
        } else {
            return {
                success: false,
                date: event.date || getMostRecentTradingDay(),
                errors: [`Lambda handler error: ${errorMessage}`]
            } as FetchResult;
        }
    }
}
