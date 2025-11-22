#!/bin/bash

# Test FRED API keys directly to verify they work
# Usage: ./scripts/test-fred-api.sh

set -e

echo "Testing FRED API Keys..."
echo ""

# Get API keys from SSM
for i in 1 2 3 4 5; do
    echo "Testing API Key $i..."
    
    # Get the API key from SSM
    API_KEY=$(aws ssm get-parameter \
        --name "/magikarp/dev/fred-api-key-$i" \
        --with-decryption \
        --query 'Parameter.Value' \
        --output text 2>/dev/null || echo "NOT_FOUND")
    
    if [ "$API_KEY" == "NOT_FOUND" ]; then
        echo "  ❌ API Key $i not found in SSM"
        continue
    fi
    
    # Test the API key with a simple request
    RESPONSE=$(curl -s -w "\n%{http_code}" \
        "https://api.stlouisfed.org/fred/series/observations?series_id=DFF&api_key=$API_KEY&file_type=json&observation_start=2024-01-01&observation_end=2024-01-01" \
        -H "User-Agent: Magikarp-Test/1.0" \
        -H "Accept: application/json")
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | head -n-1)
    
    if [ "$HTTP_CODE" == "200" ]; then
        echo "  ✅ API Key $i is valid and working"
    elif [ "$HTTP_CODE" == "403" ]; then
        echo "  ❌ API Key $i returned 403 Forbidden (blocked or invalid)"
        echo "     Response: $BODY"
    elif [ "$HTTP_CODE" == "429" ]; then
        echo "  ⚠️  API Key $i returned 429 Rate Limited"
    else
        echo "  ❌ API Key $i returned HTTP $HTTP_CODE"
        echo "     Response: $BODY"
    fi
    
    echo ""
    sleep 2  # Small delay between tests
done

echo "Test complete!"
