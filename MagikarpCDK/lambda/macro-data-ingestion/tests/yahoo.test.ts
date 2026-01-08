/**
 * Test script for Yahoo Finance client
 * 
 * Usage: npx ts-node tests/test-yahoo.ts
 */

import { YahooFinanceClient } from '../src/clients/yahoo-client';

async function testYahooClient() {
    console.log('Testing Yahoo Finance Client...\n');

    const client = new YahooFinanceClient();

    // Test with a recent date (adjust as needed)
    const testDate = '2025-11-14';

    console.log(`Fetching data for ${testDate}...\n`);

    // Test VIX
    console.log('Fetching VIX (^VIX)...');
    const vix = await client.fetchVix(testDate);
    if (vix !== null) {
        console.log(`✓ VIX: ${vix.toFixed(2)}`);
    } else {
        console.log('✗ VIX: Failed to fetch');
    }
    console.log();

    // Test DXY
    console.log('Fetching DXY (DX-Y.NYB)...');
    const dxy = await client.fetchDxy(testDate);
    if (dxy !== null) {
        console.log(`✓ DXY: ${dxy.toFixed(2)}`);
    } else {
        console.log('✗ DXY: Failed to fetch');
    }
    console.log();

    // Test generic fetchClosingPrice with SPY
    console.log('Fetching SPY (as additional test)...');
    const spy = await client.fetchClosingPrice('SPY', testDate);
    if (spy !== null) {
        console.log(`✓ SPY: ${spy.toFixed(2)}`);
    } else {
        console.log('✗ SPY: Failed to fetch');
    }
    console.log();

    // Test with an older date to verify historical data
    const historicalDate = '2024-01-15';
    console.log(`Fetching VIX for historical date ${historicalDate}...`);
    const historicalVix = await client.fetchVix(historicalDate);
    if (historicalVix !== null) {
        console.log(`✓ Historical VIX: ${historicalVix.toFixed(2)}`);
    } else {
        console.log('✗ Historical VIX: Failed to fetch');
    }
    console.log();

    console.log('Test completed!');
}

testYahooClient().catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
});
