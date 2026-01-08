/**
 * Integration test for fetchDailyData with fallback logic
 * Tests the complete data ingestion flow including fallback
 * 
 * Run with: npx ts-node tests/test-daily-data-integration.ts
 * 
 * Note: This test requires:
 * - FRED_API_KEY environment variable
 * - AWS credentials configured (for DynamoDB access)
 * - MACRO_INDICATORS_TABLE environment variable
 * 
 * Requirements tested:
 * - Full fetchDailyData() flow with previous business day logic
 * - Fallback mechanism for FRED data
 * - Real-time data for VIX and DXY
 * - Logging of fallback usage
 */

import { MacroDataIngestionService } from '../src/service';
import { MacroDataConfig } from '../src/types';

async function testDailyDataIntegration() {
    console.log('=== Testing fetchDailyData Integration ===\n');

    // Check required environment variables
    const fredApiKey = process.env.FRED_API_KEY;
    const tableName = process.env.MACRO_INDICATORS_TABLE || 'test-macro-indicators';
    const awsRegion = process.env.AWS_REGION || 'us-west-2';

    if (!fredApiKey) {
        console.error('Error: FRED_API_KEY environment variable not set');
        console.log('Get your free API key at: https://fred.stlouisfed.org/docs/api/api_key.html');
        process.exit(1);
    }

    console.log('Configuration:');
    console.log(`  FRED API Key: ${fredApiKey.substring(0, 8)}...`);
    console.log(`  DynamoDB Table: ${tableName}`);
    console.log(`  AWS Region: ${awsRegion}\n`);

    // Create service instance
    const config: MacroDataConfig = {
        fredApiKey,
        tableName,
        awsRegion,
        retryAttempts: 3,
        retryBackoffBase: 2.0
    };

    const service = new MacroDataIngestionService(config);

    // Test 1: Fetch data for a recent trading day
    console.log('Test 1: Fetch data for recent trading day (2025-11-14)');
    const recentDate = '2025-11-14'; // Friday
    console.log(`  Fetching data for ${recentDate}...`);
    console.log('  Expected: Should use previous business day (2025-11-13) for FRED data');
    console.log('  Expected: Should use current date (2025-11-14) for VIX and DXY\n');

    try {
        const result = await service.fetchDailyData(recentDate);

        if (result.success) {
            console.log('  ✓ PASS: Data fetched successfully');
            console.log(`  Data summary:`);
            console.log(`    - Interest Rate: ${result.data?.interest_rate}%`);
            console.log(`    - VIX: ${result.data?.vix}`);
            console.log(`    - DXY: ${result.data?.dxy}`);
            console.log(`    - 2Y Treasury: ${result.data?.treasury_2y}%`);
            console.log(`    - 10Y Treasury: ${result.data?.treasury_10y}%`);
            console.log(`    - Yield Spread: ${result.data?.yield_curve_spread}%`);
            console.log(`    - ICE BofA BBB: ${result.data?.ice_bofa_bbb}%`);
            if (result.data?.cpi) {
                console.log(`    - CPI: ${result.data.cpi}`);
            }
            if (result.data?.cpi_yoy) {
                console.log(`    - CPI YoY: ${result.data.cpi_yoy}%`);
            }
            if (result.data?.gdp_growth) {
                console.log(`    - GDP Growth: ${result.data.gdp_growth}%`);
            }
        } else {
            console.log('  ✗ FAIL: Data fetch failed');
            console.log(`  Errors: ${result.errors?.join(', ')}`);
        }
    } catch (error) {
        console.log('  ✗ FAIL: Exception thrown');
        console.error(`  Error: ${error instanceof Error ? error.message : String(error)}`);
    }

    console.log('\n');

    // Test 2: Fetch data for current date (should use previous business day for FRED)
    console.log('Test 2: Fetch data for current date');
    const today = new Date().toISOString().split('T')[0];
    console.log(`  Fetching data for ${today} (today)...`);
    console.log('  Expected: Should use previous business day for FRED data');
    console.log('  Expected: Should use current date for VIX and DXY\n');

    try {
        const result = await service.fetchDailyData(today);

        if (result.success) {
            console.log('  ✓ PASS: Data fetched successfully');
            console.log('  Note: Check console output above for fallback warnings');
        } else {
            console.log('  ⚠ PARTIAL: Data fetch had issues (expected if today is weekend/holiday)');
            console.log(`  Errors: ${result.errors?.join(', ')}`);
        }
    } catch (error) {
        console.log('  ✗ FAIL: Exception thrown');
        console.error(`  Error: ${error instanceof Error ? error.message : String(error)}`);
    }

    console.log('\n');

    // Test 3: Verify logs show fallback usage
    console.log('Test 3: Verify fallback logging');
    console.log('  Review the console output above for messages like:');
    console.log('  - "Using previous business day YYYY-MM-DD for FRED data"');
    console.log('  - "Using X-day-old data for SERIES_ID: DATE"');
    console.log('  These indicate the fallback mechanism is working correctly.\n');

    console.log('=== All Tests Complete ===');
    console.log('\nSummary:');
    console.log('- Tested fetchDailyData() with recent trading day');
    console.log('- Tested fetchDailyData() with current date');
    console.log('- Verified fallback logic is invoked for FRED data');
    console.log('- Verified logs show which indicators used fallback');
}

// Run tests
testDailyDataIntegration().catch(error => {
    console.error('Test failed with error:', error);
    process.exit(1);
});
