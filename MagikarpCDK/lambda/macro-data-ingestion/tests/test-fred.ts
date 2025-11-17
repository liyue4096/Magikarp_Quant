/**
 * Manual test script for FRED API client
 * Run with: npx ts-node tests/test-fred.ts
 * 
 * You'll need to set your FRED API key as an environment variable:
 * export FRED_API_KEY=your_api_key_here
 */

import { FredApiClient } from '../clients/fred-client';

async function testFredClient() {
    const apiKey = process.env.FRED_API_KEY;

    if (!apiKey) {
        console.error('Error: FRED_API_KEY environment variable not set');
        console.log('Get your free API key at: https://fred.stlouisfed.org/docs/api/api_key.html');
        process.exit(1);
    }

    const client = new FredApiClient(apiKey);
    const testDate = '2000-01-03'; // Use a recent date

    console.log('Testing FRED API Client...\n');

    try {
        // Test Federal Funds Rate
        console.log('1. Fetching Federal Funds Rate...');
        const ffr = await client.fetchFederalFundsRate(testDate);
        console.log(`   Result: ${ffr}%\n`);

        // Test 10-Year Treasury
        console.log('2. Fetching 10-Year Treasury Yield...');
        const treasury10y = await client.fetchTreasury10Year(testDate);
        console.log(`   Result: ${treasury10y}%\n`);

        // Test 2-Year Treasury
        console.log('3. Fetching 2-Year Treasury Yield...');
        const treasury2y = await client.fetchTreasury2Year(testDate);
        console.log(`   Result: ${treasury2y}%\n`);

        // Test CPI
        console.log('4. Fetching CPI...');
        const cpi = await client.fetchCpi(testDate);
        console.log(`   Result: ${cpi}\n`);

        // Test ICE BofA BBB
        console.log('5. Fetching ICE BofA BBB Yield...');
        const bbb = await client.fetchIceBofaBbb(testDate);
        console.log(`   Result: ${bbb}%\n`);

        // Debug: Test both possible series IDs
        console.log('   Debug - Testing alternative series IDs:');
        // const bbbAlt1 = await client.fetchSeries('BAMLC0A4CBBB', testDate);
        // console.log(`   BAMLC0A4CBBB: ${bbbAlt1}%`);
        const bbbAlt2 = await client.fetchSeries('BAMLC0A4CBBBEY', testDate);
        console.log(`   BAMLC0A4CBBBEY: ${bbbAlt2}%\n`);

        // Test GDP (may be null for daily dates)
        console.log('6. Fetching GDP Growth Rate (quarterly data)...');
        const gdp = await client.fetchGdpGrowth(testDate);
        console.log(`   Result: ${gdp !== null ? gdp + '%' : 'Not available (quarterly data)'}\n`);

        console.log('✅ All tests completed successfully!');

    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
}

testFredClient();
