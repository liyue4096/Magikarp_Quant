/**
 * Simple test for End-of-Day Stock Data
 *
 * Quick test to verify the fetchEndOfDayData function works
 *
 * Usage:
 *   cd lambda/macro-data-ingestion
 *   npx ts-node tests/test-stock-simple.ts
 */

import { YahooFinanceClient } from '../src/clients/yahoo-client';

async function quickTest() {
    console.log('Testing fetchEndOfDayData...\n');

    const client = new YahooFinanceClient();

    // Test with Apple stock on a recent trading day
    const symbol = 'AAPL';
    const date = '2024-12-13';

    console.log(`Fetching ${symbol} data for ${date}...\n`);

    const data = await client.fetchEndOfDayData(symbol, date);

    if (data) {
        console.log('✓ Success! Received data:\n');
        console.log(JSON.stringify(data, null, 2));
        console.log('\nFormatted Output:');
        console.log(`Symbol:    ${data.symbol}`);
        console.log(`Date:      ${data.date}`);
        console.log(`Open:      $${data.open.toFixed(2)}`);
        console.log(`High:      $${data.high.toFixed(2)}`);
        console.log(`Low:       $${data.low.toFixed(2)}`);
        console.log(`Close:     $${data.close.toFixed(2)}`);
        console.log(`Volume:    ${data.volume.toLocaleString()} shares`);

        const change = data.close - data.open;
        const changePercent = (change / data.open) * 100;
        console.log(`Change:    ${change > 0 ? '+' : ''}$${change.toFixed(2)} (${changePercent.toFixed(2)}%)`);
    } else {
        console.log('✗ Failed to fetch data');
    }
}

quickTest().catch(console.error);
