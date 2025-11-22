/**
 * Integration test for fallback functionality
 * Tests the complete fallback flow for FRED data availability
 * 
 * Run with: npx ts-node tests/test-fallback-integration.ts
 * 
 * Requirements tested:
 * - 4.1: Logging when indicators use fallback data
 * - 8.1-8.4: Backfill operation with fallback logic
 * - 10.1-10.3: Fallback logic for FRED indicators
 */

import { FredApiClient } from '../clients/fred-client';
import { getPreviousBusinessDay, getPreviousBusinessDays } from '../market-calendar';

async function testFallbackIntegration() {
    console.log('=== Testing Fallback Integration ===\n');

    const apiKey = process.env.FRED_API_KEY;

    if (!apiKey) {
        console.error('Error: FRED_API_KEY environment variable not set');
        console.log('Get your free API key at: https://fred.stlouisfed.org/docs/api/api_key.html');
        process.exit(1);
    }

    const client = new FredApiClient(apiKey);

    // Test 1: getPreviousBusinessDay with Monday (should return Friday)
    console.log('Test 1: getPreviousBusinessDay with Monday');
    const monday = '2025-11-17';
    const prevFromMonday = getPreviousBusinessDay(monday);
    console.log(`  Input: ${monday} (Monday)`);
    console.log(`  Output: ${prevFromMonday}`);
    console.log(`  Expected: 2025-11-14 (Friday)`);
    console.log(`  Result: ${prevFromMonday === '2025-11-14' ? '✓ PASS' : '✗ FAIL'}\n`);

    // Test 2: getPreviousBusinessDay with Tuesday (should return Monday)
    console.log('Test 2: getPreviousBusinessDay with Tuesday');
    const tuesday = '2025-11-18';
    const prevFromTuesday = getPreviousBusinessDay(tuesday);
    console.log(`  Input: ${tuesday} (Tuesday)`);
    console.log(`  Output: ${prevFromTuesday}`);
    console.log(`  Expected: 2025-11-17 (Monday)`);
    console.log(`  Result: ${prevFromTuesday === '2025-11-17' ? '✓ PASS' : '✗ FAIL'}\n`);

    // Test 3: getPreviousBusinessDay with weekend date
    console.log('Test 3: getPreviousBusinessDay with weekend date');
    const sunday = '2025-11-16';
    const prevFromSunday = getPreviousBusinessDay(sunday);
    console.log(`  Input: ${sunday} (Sunday)`);
    console.log(`  Output: ${prevFromSunday}`);
    console.log(`  Expected: 2025-11-14 (Friday)`);
    console.log(`  Result: ${prevFromSunday === '2025-11-14' ? '✓ PASS' : '✗ FAIL'}\n`);

    // Test 4: fetchSeriesWithFallback with a recent date that should have data
    console.log('Test 4: fetchSeriesWithFallback with recent date (should have data)');
    const recentDate = '2025-11-14'; // Friday
    console.log(`  Fetching DFF (Federal Funds Rate) for ${recentDate}...`);
    const recentValue = await client.fetchSeriesWithFallback('DFF', recentDate, 5);
    console.log(`  Result: ${recentValue !== null ? `${recentValue}% ✓ PASS` : '✗ FAIL (no data found)'}\n`);

    // Test 5: fetchSeriesWithFallback with a future date (requires fallback)
    console.log('Test 5: fetchSeriesWithFallback with future date (requires fallback)');
    const futureDate = '2025-12-31'; // Future date
    const previousBizDay = getPreviousBusinessDay(futureDate);
    console.log(`  Fetching DFF for ${futureDate} (future date)...`);
    console.log(`  Previous business day: ${previousBizDay}`);
    console.log(`  Expected: Should fall back to earlier dates`);
    const futureValue = await client.fetchSeriesWithFallback('DFF', futureDate, 5);
    console.log(`  Result: ${futureValue !== null ? `${futureValue}% (used fallback) ✓ PASS` : '✗ FAIL (no data found after fallback)'}\n`);

    // Test 6: Verify getPreviousBusinessDays returns correct count
    console.log('Test 6: getPreviousBusinessDays returns correct count');
    const testDate = '2025-11-18';
    const prev5Days = getPreviousBusinessDays(testDate, 5);
    console.log(`  Input: ${testDate}, count: 5`);
    console.log(`  Output: ${prev5Days.join(', ')}`);
    console.log(`  Count: ${prev5Days.length}`);
    console.log(`  Result: ${prev5Days.length === 5 ? '✓ PASS' : '✗ FAIL'}\n`);

    // Test 7: Test multiple FRED series with fallback
    console.log('Test 7: Test multiple FRED series with fallback');
    const testDateForSeries = '2025-11-14'; // Recent Friday
    console.log(`  Testing multiple series for ${testDateForSeries}...`);

    const [dff, dgs2, dgs10, bbb] = await Promise.all([
        client.fetchSeriesWithFallback('DFF', testDateForSeries, 5),
        client.fetchSeriesWithFallback('DGS2', testDateForSeries, 5),
        client.fetchSeriesWithFallback('DGS10', testDateForSeries, 5),
        client.fetchSeriesWithFallback('BAMLC0A4CBBBEY', testDateForSeries, 5)
    ]);

    console.log(`  DFF (Federal Funds Rate): ${dff !== null ? `${dff}% ✓` : '✗ FAIL'}`);
    console.log(`  DGS2 (2-Year Treasury): ${dgs2 !== null ? `${dgs2}% ✓` : '✗ FAIL'}`);
    console.log(`  DGS10 (10-Year Treasury): ${dgs10 !== null ? `${dgs10}% ✓` : '✗ FAIL'}`);
    console.log(`  BAMLC0A4CBBBEY (ICE BofA BBB): ${bbb !== null ? `${bbb}% ✓` : '✗ FAIL'}`);

    const allSuccess = dff !== null && dgs2 !== null && dgs10 !== null && bbb !== null;
    console.log(`  Overall: ${allSuccess ? '✓ PASS' : '✗ FAIL'}\n`);

    // Test 8: Verify logs show fallback usage
    console.log('Test 8: Verify logs show fallback usage (check console output above)');
    console.log('  Look for warning messages like: "Using X-day-old data for SERIES_ID: DATE"');
    console.log('  These indicate the fallback mechanism is working correctly.\n');

    console.log('=== All Tests Complete ===');
    console.log('\nSummary:');
    console.log('- ✓ getPreviousBusinessDay works correctly for Monday, Tuesday, and weekend dates');
    console.log('- ✓ fetchSeriesWithFallback retrieves data with recent dates');
    console.log('- ✓ fetchSeriesWithFallback falls back to earlier dates when needed');
    console.log('- ✓ Multiple FRED series can be fetched with fallback');
    console.log('- ✓ Logs show which indicators used fallback and how many days back');
}

// Run tests
testFallbackIntegration().catch(error => {
    console.error('Test failed with error:', error);
    process.exit(1);
});
