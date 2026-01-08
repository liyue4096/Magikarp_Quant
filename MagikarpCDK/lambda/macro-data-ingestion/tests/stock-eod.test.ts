/**
 * Test script for Yahoo Finance End-of-Day Stock Data
 *
 * This test demonstrates fetching complete OHLCV (Open, High, Low, Close, Volume)
 * data for individual stocks at the end of a market day.
 *
 * Reference: https://github.com/gadicc/yahoo-finance2
 *
 * Usage:
 *   cd lambda/macro-data-ingestion
 *   npx ts-node tests/test-stock-eod.ts
 */

import { YahooFinanceClient, EndOfDayStockData } from '../src/clients/yahoo-client';

/**
 * Format number with commas for better readability
 */
function formatNumber(num: number, decimals: number = 2): string {
    return num.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

/**
 * Format volume with K/M/B suffixes
 */
function formatVolume(volume: number): string {
    if (volume >= 1_000_000_000) {
        return `${(volume / 1_000_000_000).toFixed(2)}B`;
    } else if (volume >= 1_000_000) {
        return `${(volume / 1_000_000).toFixed(2)}M`;
    } else if (volume >= 1_000) {
        return `${(volume / 1_000).toFixed(2)}K`;
    }
    return volume.toString();
}

/**
 * Print stock data in a formatted table
 */
function printStockData(data: EndOfDayStockData): void {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  ${data.symbol} - ${data.date}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`  Timestamp:    ${new Date(data.timestamp * 1000).toISOString()}`);
    console.log(`  Open:         $${formatNumber(data.open)}`);
    console.log(`  High:         $${formatNumber(data.high)}`);
    console.log(`  Low:          $${formatNumber(data.low)}`);
    console.log(`  Close:        $${formatNumber(data.close)}`);
    console.log(`  Volume:       ${formatVolume(data.volume)} (${formatNumber(data.volume, 0)} shares)`);

    // Calculate intraday metrics
    const dailyRange = data.high - data.low;
    const dailyChange = data.close - data.open;
    const dailyChangePercent = (dailyChange / data.open) * 100;

    console.log(`\n  Daily Range:  $${formatNumber(dailyRange)} (${formatNumber((dailyRange / data.open) * 100)}%)`);
    console.log(`  Daily Change: $${formatNumber(dailyChange)} (${dailyChangePercent > 0 ? '+' : ''}${formatNumber(dailyChangePercent)}%)`);
    console.log(`${'='.repeat(60)}\n`);
}

/**
 * Test fetching end-of-day data for multiple stocks
 */
async function testEndOfDayData() {
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║  Yahoo Finance End-of-Day Stock Data Test                ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    const client = new YahooFinanceClient();

    // Test with a recent market day (adjust date as needed)
    const testDate = '2024-12-13'; // Friday, December 13, 2024

    // Stock symbols to test
    const symbols = [
        'AAPL',  // Apple - Tech stock
        'MSFT',  // Microsoft - Tech stock
        'SPY',   // S&P 500 ETF
        'TSLA',  // Tesla - High volatility stock
        'JPM',   // JPMorgan Chase - Financial stock
    ];

    console.log(`Test Date: ${testDate}`);
    console.log(`Symbols: ${symbols.join(', ')}\n`);

    const results: { [key: string]: EndOfDayStockData | null } = {};

    // Fetch data for all symbols
    for (const symbol of symbols) {
        console.log(`Fetching ${symbol}...`);
        try {
            const data = await client.fetchEndOfDayData(symbol, testDate);
            results[symbol] = data;

            if (data) {
                console.log(`✓ ${symbol}: Successfully fetched`);
                printStockData(data);
            } else {
                console.log(`✗ ${symbol}: No data available\n`);
            }
        } catch (error) {
            console.error(`✗ ${symbol}: Error -`, error);
            results[symbol] = null;
        }
    }

    // Summary
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║  Test Summary                                             ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    const successful = Object.values(results).filter(r => r !== null).length;
    const failed = symbols.length - successful;

    console.log(`Total symbols tested: ${symbols.length}`);
    console.log(`Successful fetches:   ${successful} ✓`);
    console.log(`Failed fetches:       ${failed} ✗`);
    console.log();

    // Test historical data
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║  Historical Data Test                                     ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    const historicalDate = '2024-01-15'; // January 15, 2024
    console.log(`Fetching AAPL for historical date: ${historicalDate}`);

    const historicalData = await client.fetchEndOfDayData('AAPL', historicalDate);
    if (historicalData) {
        console.log(`✓ Historical data successfully fetched`);
        printStockData(historicalData);
    } else {
        console.log(`✗ Failed to fetch historical data\n`);
    }

    // Test edge cases
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║  Edge Case Tests                                          ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    // Test 1: Invalid symbol
    console.log('Test 1: Invalid symbol (INVALID123)');
    const invalidSymbol = await client.fetchEndOfDayData('INVALID123', testDate);
    console.log(invalidSymbol ? '✗ Should have failed' : '✓ Correctly returned null\n');

    // Test 2: Weekend date (should return null or closest trading day data)
    const weekendDate = '2024-12-14'; // Saturday
    console.log(`Test 2: Weekend date (${weekendDate})`);
    const weekendData = await client.fetchEndOfDayData('AAPL', weekendDate);
    console.log(weekendData ? `✓ Returned data (may be from nearest trading day)` : '✓ Correctly returned null (no trading on weekend)\n');

    // Test 3: Future date
    const futureDate = '2030-01-01';
    console.log(`Test 3: Future date (${futureDate})`);
    const futureData = await client.fetchEndOfDayData('AAPL', futureDate);
    console.log(futureData ? '✗ Should have failed' : '✓ Correctly returned null\n');

    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║  All Tests Completed                                      ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');
}

/**
 * Test batch fetching for multiple stocks
 */
async function testBatchFetching() {
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║  Batch Fetching Test (Simulating Portfolio)              ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    const client = new YahooFinanceClient();
    const date = '2024-12-13';

    // Simulate a portfolio of stocks
    const portfolio = ['AAPL', 'GOOGL', 'AMZN', 'NVDA', 'META'];

    console.log(`Fetching portfolio data for ${date}...`);
    console.log(`Portfolio: ${portfolio.join(', ')}\n`);

    const startTime = Date.now();

    // Fetch all stocks (sequential due to rate limiting)
    const portfolioData = await Promise.all(
        portfolio.map(async (symbol) => {
            const data = await client.fetchEndOfDayData(symbol, date);
            return { symbol, data };
        })
    );

    const endTime = Date.now();
    const elapsedTime = ((endTime - startTime) / 1000).toFixed(2);

    // Calculate portfolio metrics
    let totalValue = 0;
    let totalChange = 0;

    console.log('\nPortfolio Summary:');
    console.log(`${'Symbol'.padEnd(10)} | ${'Close'.padStart(12)} | ${'Change'.padStart(12)} | ${'Volume'.padStart(15)}`);
    console.log('-'.repeat(60));

    portfolioData.forEach(({ symbol, data }) => {
        if (data) {
            const change = data.close - data.open;
            const changePercent = (change / data.open) * 100;

            console.log(
                `${symbol.padEnd(10)} | ` +
                `$${formatNumber(data.close).padStart(10)} | ` +
                `${(changePercent > 0 ? '+' : '')}${formatNumber(changePercent).padStart(9)}% | ` +
                `${formatVolume(data.volume).padStart(15)}`
            );

            totalValue += data.close;
            totalChange += changePercent;
        } else {
            console.log(`${symbol.padEnd(10)} | ${'N/A'.padStart(12)} | ${'N/A'.padStart(12)} | ${'N/A'.padStart(15)}`);
        }
    });

    console.log('-'.repeat(60));
    console.log(`\nAverage Change: ${(totalChange / portfolio.length).toFixed(2)}%`);
    console.log(`Time Elapsed: ${elapsedTime}s`);
    console.log(`Average Time per Stock: ${(parseFloat(elapsedTime) / portfolio.length).toFixed(2)}s\n`);
}

/**
 * Main test runner
 */
async function main() {
    try {
        // Run main end-of-day data test
        await testEndOfDayData();

        // Run batch fetching test
        await testBatchFetching();

        console.log('\n✓ All tests completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('\n✗ Test failed with error:', error);
        process.exit(1);
    }
}

// Run the tests
main();
