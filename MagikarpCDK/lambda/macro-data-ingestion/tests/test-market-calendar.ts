/**
 * Test script for market calendar utility
 * 
 * Tests:
 * - Weekend detection
 * - Holiday detection
 * - Trading day generation
 * - Next/previous trading day calculation
 * 
 * Usage: npx ts-node tests/test-market-calendar.ts
 */

import {
    isWeekend,
    isUSHoliday,
    isMarketOpen,
    getNextTradingDay,
    getPreviousTradingDay,
    getTradingDaysBetween,
    getMostRecentTradingDay
} from '../market-calendar';

function testMarketCalendar() {
    console.log('=== Testing Market Calendar Utility ===\n');

    // Test 1: Weekend detection
    console.log('Test 1: Weekend Detection');
    const saturday = '2024-01-06'; // Saturday
    const sunday = '2024-01-07'; // Sunday
    const monday = '2024-01-08'; // Monday

    console.log(`${saturday} (Saturday): ${isWeekend(new Date(saturday)) ? '✓ Weekend' : '✗ Not weekend'}`);
    console.log(`${sunday} (Sunday): ${isWeekend(new Date(sunday)) ? '✓ Weekend' : '✗ Not weekend'}`);
    console.log(`${monday} (Monday): ${!isWeekend(new Date(monday)) ? '✓ Not weekend' : '✗ Weekend'}`);
    console.log();

    // Test 2: Holiday detection
    console.log('Test 2: Holiday Detection');
    const newYears2024 = '2024-01-01'; // New Year's Day
    const mlkDay2024 = '2024-01-15'; // MLK Day
    const regularDay = '2024-01-10'; // Regular Wednesday

    console.log(`${newYears2024} (New Year's): ${isUSHoliday(newYears2024) ? '✓ Holiday' : '✗ Not holiday'}`);
    console.log(`${mlkDay2024} (MLK Day): ${isUSHoliday(mlkDay2024) ? '✓ Holiday' : '✗ Not holiday'}`);
    console.log(`${regularDay} (Regular day): ${!isUSHoliday(regularDay) ? '✓ Not holiday' : '✗ Holiday'}`);
    console.log();

    // Test 3: Market open check
    console.log('Test 3: Market Open Check');
    console.log(`${saturday}: ${!isMarketOpen(saturday) ? '✓ Market closed' : '✗ Market open'}`);
    console.log(`${newYears2024}: ${!isMarketOpen(newYears2024) ? '✓ Market closed' : '✗ Market open'}`);
    console.log(`${regularDay}: ${isMarketOpen(regularDay) ? '✓ Market open' : '✗ Market closed'}`);
    console.log();

    // Test 4: Next trading day
    console.log('Test 4: Next Trading Day');
    const friday = '2024-01-05'; // Friday
    const nextAfterFriday = getNextTradingDay(friday);
    console.log(`Next trading day after ${friday} (Friday): ${nextAfterFriday}`);
    console.log(`Expected: 2024-01-08 (Monday), Got: ${nextAfterFriday} ${nextAfterFriday === '2024-01-08' ? '✓' : '✗'}`);
    console.log();

    // Test 5: Previous trading day
    console.log('Test 5: Previous Trading Day');
    const prevBeforeMonday = getPreviousTradingDay(monday);
    console.log(`Previous trading day before ${monday} (Monday): ${prevBeforeMonday}`);
    console.log(`Expected: 2024-01-05 (Friday), Got: ${prevBeforeMonday} ${prevBeforeMonday === '2024-01-05' ? '✓' : '✗'}`);
    console.log();

    // Test 6: Trading days between dates
    console.log('Test 6: Trading Days Between Dates');
    const startDate = '2000-01-03'; // First trading day of 2000
    const endDate = '2000-01-14'; // Two weeks later
    const tradingDays = getTradingDaysBetween(startDate, endDate);

    console.log(`Trading days from ${startDate} to ${endDate}:`);
    console.log(`Total: ${tradingDays.length} days`);
    console.log('Days:', tradingDays.join(', '));
    console.log(`Expected: ~10 trading days (2 weeks minus weekends)`);
    console.log();

    // Test 7: Year 2000 start
    console.log('Test 7: Year 2000 Start Date');
    const y2k = '2000-01-01'; // Saturday, New Year's
    const y2kPlus1 = '2000-01-02'; // Sunday
    const y2kPlus2 = '2000-01-03'; // Monday - first trading day

    console.log(`${y2k}: ${!isMarketOpen(y2k) ? '✓ Closed (Sat + Holiday)' : '✗ Open'}`);
    console.log(`${y2kPlus1}: ${!isMarketOpen(y2kPlus1) ? '✓ Closed (Sunday)' : '✗ Open'}`);
    console.log(`${y2kPlus2}: ${isMarketOpen(y2kPlus2) ? '✓ Open (First trading day of 2000)' : '✗ Closed'}`);
    console.log();

    // Test 8: Most recent trading day
    console.log('Test 8: Most Recent Trading Day');
    const mostRecent = getMostRecentTradingDay();
    console.log(`Most recent trading day: ${mostRecent}`);
    console.log(`Is it a trading day? ${isMarketOpen(mostRecent) ? '✓ Yes' : '✗ No'}`);
    console.log();

    // Test 9: Count trading days in 2024
    console.log('Test 9: Trading Days in 2024');
    const tradingDays2024 = getTradingDaysBetween('2024-01-01', '2024-12-31');
    console.log(`Total trading days in 2024: ${tradingDays2024.length}`);
    console.log(`Expected: ~252 trading days (typical year)`);
    console.log(`Actual: ${tradingDays2024.length} ${Math.abs(tradingDays2024.length - 252) <= 5 ? '✓' : '✗'}`);
    console.log();

    // Test 10: Backfill from 2000-01-03
    console.log('Test 10: Backfill Simulation (2000-01-03 to 2000-12-31)');
    const backfillDays = getTradingDaysBetween('2000-01-03', '2000-12-31');
    console.log(`Trading days in year 2000: ${backfillDays.length}`);
    console.log(`First day: ${backfillDays[0]}`);
    console.log(`Last day: ${backfillDays[backfillDays.length - 1]}`);
    console.log();

    console.log('=== Test Complete ===');
}

// Run tests
testMarketCalendar();
