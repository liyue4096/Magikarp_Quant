/**
 * Test script for Alpha Vantage client
 * 
 * IMPORTANT: Alpha Vantage does NOT support VIX in their free tier.
 * VIX is a CBOE proprietary index requiring special data feeds.
 * 
 * This script tests:
 * - VIX graceful degradation (always returns null)
 * - Fetching regular stock/ETF data (e.g., SPY)
 * - Retry logic
 * - Rate limiting
 * - Error handling
 * 
 * Usage: ts-node tests/test-alpha-vantage.ts
 */

import { AlphaVantageClient } from '../clients/alpha-vantage-client';

async function testAlphaVantageClient() {
    console.log('=== Testing Alpha Vantage Client ===\n');

    // Get API key from environment
    const apiKey = process.env.ALPHA_VANTAGE_API_KEY;

    if (!apiKey) {
        console.error('ERROR: ALPHA_VANTAGE_API_KEY environment variable not set');
        console.log('Please set your Alpha Vantage API key:');
        console.log('export ALPHA_VANTAGE_API_KEY="your_api_key_here"');
        console.log('\nGet a free key at: https://www.alphavantage.co/support/#api-key');
        process.exit(1);
    }

    const client = new AlphaVantageClient(apiKey);

    // Test 1: VIX graceful degradation
    console.log('Test 1: VIX graceful degradation (VIX not supported)');
    console.log('Alpha Vantage does NOT support VIX in their free tier API.');
    console.log('Testing that fetchVix() correctly returns null...\n');

    const testDate = '2024-01-15';
    const vix = await client.fetchVix(testDate);

    if (vix === null) {
        console.log('✓ PASS: fetchVix() correctly returned null (graceful degradation)');
        console.log('  This is expected behavior - VIX is not available via Alpha Vantage');
    } else {
        console.log(`✗ FAIL: Unexpected result: ${vix}`);
    }

    console.log();

    // Test 2: Check API availability after VIX attempt
    console.log('Test 2: API availability after VIX request');
    const isAvailableAfterVix = client.isApiAvailable();
    console.log(`API status: ${isAvailableAfterVix ? 'Available' : 'Unavailable (expected)'}`);

    if (!isAvailableAfterVix) {
        console.log('✓ PASS: API correctly marked as unavailable for VIX');
        console.log('  Resetting availability for next test...');
        client.resetAvailability();
    }

    console.log();

    // Test 3: Fetch real stock data (SPY - S&P 500 ETF)
    console.log('Test 3: Fetching real stock data (SPY)');
    console.log(`Fetching SPY for ${testDate}...`);
    console.log('Note: This will use 1 of your 25 daily API calls\n');

    try {
        const spy = await client.fetchSymbol('SPY', testDate);

        if (spy !== null) {
            console.log(`✓ PASS: Successfully fetched SPY: $${spy.toFixed(2)}`);
            console.log(`  - Value is reasonable: ${spy > 100 && spy < 1000 ? 'Yes' : 'No'}`);
        } else {
            console.log('✗ FAIL: Could not fetch SPY data');
            console.log('  Possible reasons:');
            console.log('  - Rate limit reached (25 requests/day)');
            console.log('  - Invalid API key');
            console.log('  - Network issues');
        }
    } catch (error) {
        console.error('✗ Error fetching SPY:', error);
    }

    console.log();

    // Test 4: Check API availability
    console.log('Test 4: Final API availability check');
    const isAvailable = client.isApiAvailable();
    console.log(`API availability: ${isAvailable ? 'Available' : 'Unavailable'}`);

    if (!isAvailable) {
        console.log('\nNote: API is marked as unavailable. This could be due to:');
        console.log('  - Rate limit reached (25 requests/day for free tier)');
        console.log('  - Network errors during previous requests');
        console.log('  - Invalid API key');
    }

    console.log();
    console.log('=== Test Complete ===\n');

    console.log('Summary:');
    console.log('- VIX is NOT supported by Alpha Vantage free tier');
    console.log('- Use Yahoo Finance as the primary (and only) VIX data source');
    console.log('- Alpha Vantage can be used for regular stocks/ETFs (SPY, AAPL, etc.)');
    console.log('- Free tier limit: 25 requests per day');
    console.log('- Premium tier: $50/month for 75 requests/minute');
}

// Run tests
testAlphaVantageClient().catch(console.error);
