/**
 * Test script for Yahoo Finance Fundamental Data
 *
 * Tests fetching P/E, P/S, P/B ratios and other fundamental metrics
 *
 * Usage:
 *   cd lambda/macro-data-ingestion
 *   npx ts-node tests/test-fundamentals.ts
 */

import { YahooFinanceClient } from '../src/clients/yahoo-client';

/**
 * Format large numbers with K/M/B/T suffixes
 */
function formatLargeNumber(num: number | null): string {
    if (num === null) return 'N/A';

    const abs = Math.abs(num);
    if (abs >= 1_000_000_000_000) {
        return `$${(num / 1_000_000_000_000).toFixed(2)}T`;
    } else if (abs >= 1_000_000_000) {
        return `$${(num / 1_000_000_000).toFixed(2)}B`;
    } else if (abs >= 1_000_000) {
        return `$${(num / 1_000_000).toFixed(2)}M`;
    } else if (abs >= 1_000) {
        return `$${(num / 1_000).toFixed(2)}K`;
    }
    return `$${num.toFixed(2)}`;
}

/**
 * Format ratio/percentage values
 */
function formatRatio(value: number | null, decimals: number = 2): string {
    if (value === null) return 'N/A';
    return value.toFixed(decimals);
}

/**
 * Format percentage
 */
function formatPercent(value: number | null): string {
    if (value === null) return 'N/A';
    return `${(value * 100).toFixed(2)}%`;
}

/**
 * Print fundamental data in a formatted table
 */
function printFundamentals(data: any): void {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`  ${data.symbol} - Fundamental Data`);
    console.log(`${'='.repeat(70)}`);

    console.log('\n📊 VALUATION RATIOS:');
    console.log(`  P/E Ratio (TTM):        ${formatRatio(data.peRatio)}`);
    console.log(`  Forward P/E:            ${formatRatio(data.forwardPE)}`);
    console.log(`  P/B Ratio:              ${formatRatio(data.pbRatio)}`);
    console.log(`  P/S Ratio (TTM):        ${formatRatio(data.psRatio)}`);
    console.log(`  PEG Ratio:              ${formatRatio(data.pegRatio)}`);

    console.log('\n💰 MARKET DATA:');
    console.log(`  Market Cap:             ${formatLargeNumber(data.marketCap)}`);
    console.log(`  Enterprise Value:       ${formatLargeNumber(data.enterpriseValue)}`);
    console.log(`  Beta (5Y):              ${formatRatio(data.beta)}`);

    console.log('\n📈 PROFITABILITY:');
    console.log(`  Profit Margin:          ${formatPercent(data.profitMargin)}`);
    console.log(`  Operating Margin:       ${formatPercent(data.operatingMargin)}`);
    console.log(`  Return on Equity:       ${formatPercent(data.returnOnEquity)}`);
    console.log(`  Return on Assets:       ${formatPercent(data.returnOnAssets)}`);

    console.log('\n💵 FINANCIAL HEALTH:');
    console.log(`  Debt-to-Equity:         ${formatRatio(data.debtToEquity)}`);
    console.log(`  Current Ratio:          ${formatRatio(data.currentRatio)}`);
    console.log(`  Quick Ratio:            ${formatRatio(data.quickRatio)}`);

    console.log('\n💲 PER SHARE DATA:');
    console.log(`  EPS (TTM):              $${formatRatio(data.eps)}`);
    console.log(`  Revenue Per Share:      $${formatRatio(data.revenuePerShare)}`);
    console.log(`  Book Value Per Share:   $${formatRatio(data.bookValuePerShare)}`);

    console.log('\n💎 DIVIDEND DATA:');
    console.log(`  Dividend Yield:         ${formatPercent(data.dividendYield)}`);
    console.log(`  Dividend Rate:          $${formatRatio(data.dividendRate)}`);
    console.log(`  Payout Ratio:           ${formatPercent(data.payoutRatio)}`);

    console.log('\n📊 GROWTH METRICS:');
    console.log(`  Revenue Growth (YoY):   ${formatPercent(data.revenueGrowth)}`);
    console.log(`  Earnings Growth (YoY):  ${formatPercent(data.earningsGrowth)}`);

    console.log('\n🔢 ADDITIONAL RATIOS:');
    console.log(`  EV/Revenue:             ${formatRatio(data.evToRevenue)}`);
    console.log(`  EV/EBITDA:              ${formatRatio(data.evToEbitda)}`);

    console.log(`\n  Last Updated: ${new Date(data.lastUpdated).toLocaleString()}`);
    console.log(`${'='.repeat(70)}\n`);
}

/**
 * Test fetching fundamental data
 */
async function testFundamentals() {
    console.log('╔═══════════════════════════════════════════════════════════════════╗');
    console.log('║  Yahoo Finance Fundamental Data Test                              ║');
    console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

    const client = new YahooFinanceClient();

    // Test stocks with different characteristics
    const symbols = [
        'AAPL',  // Large cap tech with strong fundamentals
        'TSLA',  // High growth, high P/E
        'JPM',   // Financial sector
        'JNJ',   // Dividend stock
        'GOOGL', // Tech giant
    ];

    console.log(`Testing ${symbols.length} stocks...\n`);

    for (const symbol of symbols) {
        console.log(`\n${'─'.repeat(70)}`);
        console.log(`Fetching fundamental data for ${symbol}...`);

        try {
            const data = await client.fetchFundamentals(symbol);

            if (data) {
                console.log('✓ Success!');
                printFundamentals(data);
            } else {
                console.log(`✗ No fundamental data available for ${symbol}\n`);
            }
        } catch (error) {
            console.error(`✗ Error fetching ${symbol}:`, error);
        }

        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Test complete stock data (OHLCV + Fundamentals)
    console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
    console.log('║  Complete Stock Data Test (OHLCV + Fundamentals)                 ║');
    console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

    const testSymbol = 'AAPL';
    const testDate = '2024-12-13';

    console.log(`Fetching complete data for ${testSymbol} on ${testDate}...\n`);

    const completeData = await client.fetchCompleteStockData(testSymbol, testDate);

    if (completeData.ohlcv && completeData.fundamentals) {
        console.log('✓ Successfully fetched both OHLCV and fundamental data!\n');

        // Print OHLCV data
        console.log('📊 OHLCV DATA:');
        console.log(`  Date:    ${completeData.ohlcv.date}`);
        console.log(`  Open:    $${completeData.ohlcv.open.toFixed(2)}`);
        console.log(`  High:    $${completeData.ohlcv.high.toFixed(2)}`);
        console.log(`  Low:     $${completeData.ohlcv.low.toFixed(2)}`);
        console.log(`  Close:   $${completeData.ohlcv.close.toFixed(2)}`);
        console.log(`  Volume:  ${completeData.ohlcv.volume.toLocaleString()} shares`);

        // Print key fundamentals
        console.log('\n📈 KEY FUNDAMENTALS:');
        console.log(`  P/E Ratio:     ${formatRatio(completeData.fundamentals.peRatio)}`);
        console.log(`  P/S Ratio:     ${formatRatio(completeData.fundamentals.psRatio)}`);
        console.log(`  P/B Ratio:     ${formatRatio(completeData.fundamentals.pbRatio)}`);
        console.log(`  Market Cap:    ${formatLargeNumber(completeData.fundamentals.marketCap)}`);
        console.log(`  Profit Margin: ${formatPercent(completeData.fundamentals.profitMargin)}`);

        // Calculate some derived metrics
        if (completeData.ohlcv.close && completeData.fundamentals.eps) {
            const currentPE = completeData.ohlcv.close / completeData.fundamentals.eps;
            console.log(`\n💡 DERIVED METRICS:`);
            console.log(`  Current P/E (from close price): ${currentPE.toFixed(2)}`);
        }
    } else {
        if (!completeData.ohlcv) {
            console.log('✗ Failed to fetch OHLCV data');
        }
        if (!completeData.fundamentals) {
            console.log('✗ Failed to fetch fundamental data');
        }
    }

    console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
    console.log('║  All Tests Completed                                              ║');
    console.log('╚═══════════════════════════════════════════════════════════════════╝\n');
}

/**
 * Compare fundamentals across multiple stocks
 */
async function compareFundamentals() {
    console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
    console.log('║  Fundamental Comparison - Tech Stocks                             ║');
    console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

    const client = new YahooFinanceClient();
    const symbols = ['AAPL', 'MSFT', 'GOOGL', 'META', 'NVDA'];

    const results = [];

    for (const symbol of symbols) {
        const data = await client.fetchFundamentals(symbol);
        if (data) {
            results.push(data);
        }
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Print comparison table
    console.log(`${'Symbol'.padEnd(10)} | ${'P/E'.padStart(8)} | ${'P/S'.padStart(8)} | ${'P/B'.padStart(8)} | ${'Mkt Cap'.padStart(12)} | ${'ROE'.padStart(8)}`);
    console.log('-'.repeat(80));

    results.forEach(data => {
        console.log(
            `${data.symbol.padEnd(10)} | ` +
            `${formatRatio(data.peRatio, 1).padStart(8)} | ` +
            `${formatRatio(data.psRatio, 1).padStart(8)} | ` +
            `${formatRatio(data.pbRatio, 1).padStart(8)} | ` +
            `${formatLargeNumber(data.marketCap).padStart(12)} | ` +
            `${formatPercent(data.returnOnEquity).padStart(8)}`
        );
    });

    console.log('\n');
}

/**
 * Main test runner
 */
async function main() {
    try {
        await testFundamentals();
        await compareFundamentals();

        console.log('✓ All tests completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('\n✗ Test failed with error:', error);
        process.exit(1);
    }
}

// Run the tests
main();
