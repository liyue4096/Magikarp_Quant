/**
 * Test Yahoo Finance Fundamentals with Crumb Authentication
 *
 * Usage: npx ts-node tests/test-fundamentals-crumb.ts
 */

import { YahooFundamentalsClient } from '../src/clients/yahoo-fundamentals-client';

async function testFundamentals() {
    console.log('🔐 Testing Yahoo Finance Fundamentals with Crumb Auth\n');

    const client = new YahooFundamentalsClient();

    // Test with Apple
    const symbol = 'AAPL';
    console.log(`Fetching fundamentals for ${symbol}...\n`);

    try {
        const fundamentals = await client.fetchFundamentals(symbol);

        if (fundamentals) {
            console.log('✅ Successfully fetched fundamentals!\n');
            console.log(`Symbol: ${fundamentals.symbol}`);
            console.log(`\nValuation Ratios:`);
            console.log(`  P/E Ratio:     ${fundamentals.peRatio?.toFixed(2) ?? 'N/A'}`);
            console.log(`  Forward P/E:   ${fundamentals.forwardPE?.toFixed(2) ?? 'N/A'}`);
            console.log(`  P/B Ratio:     ${fundamentals.pbRatio?.toFixed(2) ?? 'N/A'}`);
            console.log(`  P/S Ratio:     ${fundamentals.psRatio?.toFixed(2) ?? 'N/A'}`);
            console.log(`  PEG Ratio:     ${fundamentals.pegRatio?.toFixed(2) ?? 'N/A'}`);

            console.log(`\nMarket Data:`);
            console.log(`  Market Cap:    ${fundamentals.marketCap ? `$${(fundamentals.marketCap / 1e12).toFixed(2)}T` : 'N/A'}`);
            console.log(`  Beta:          ${fundamentals.beta?.toFixed(2) ?? 'N/A'}`);

            console.log(`\nProfitability:`);
            console.log(`  Profit Margin: ${fundamentals.profitMargin ? `${(fundamentals.profitMargin * 100).toFixed(2)}%` : 'N/A'}`);
            console.log(`  ROE:           ${fundamentals.returnOnEquity ? `${(fundamentals.returnOnEquity * 100).toFixed(2)}%` : 'N/A'}`);

            console.log(`\nDividend:`);
            console.log(`  Yield:         ${fundamentals.dividendYield ? `${(fundamentals.dividendYield * 100).toFixed(2)}%` : 'N/A'}`);

            console.log(`\nLast Updated: ${new Date(fundamentals.lastUpdated).toLocaleString()}`);
        } else {
            console.log('❌ Failed to fetch fundamentals');
        }
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

testFundamentals().catch(console.error);
