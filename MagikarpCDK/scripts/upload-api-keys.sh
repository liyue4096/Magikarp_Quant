#!/bin/bash

# Script to upload all 5 FRED API keys to AWS SSM Parameter Store
# Usage: ./scripts/upload-api-keys.sh

set -e

# Load environment variables from .env.prod
if [ ! -f .env.prod ]; then
    echo "Error: .env.prod file not found!"
    echo "Please create .env.prod with your API keys"
    exit 1
fi

source .env.prod

# Upload each API key to SSM Parameter Store
echo "Uploading FRED API keys to SSM Parameter Store..."

aws ssm put-parameter \
    --name "/magikarp/dev/fred-api-key-1" \
    --value "$FRED_API_KEY_1" \
    --type "SecureString" \
    --overwrite \
    --description "FRED API Key #1 for parallel backfill"

aws ssm put-parameter \
    --name "/magikarp/dev/fred-api-key-2" \
    --value "$FRED_API_KEY_2" \
    --type "SecureString" \
    --overwrite \
    --description "FRED API Key #2 for parallel backfill"

aws ssm put-parameter \
    --name "/magikarp/dev/fred-api-key-3" \
    --value "$FRED_API_KEY_3" \
    --type "SecureString" \
    --overwrite \
    --description "FRED API Key #3 for parallel backfill"

aws ssm put-parameter \
    --name "/magikarp/dev/fred-api-key-4" \
    --value "$FRED_API_KEY_4" \
    --type "SecureString" \
    --overwrite \
    --description "FRED API Key #4 for parallel backfill"

aws ssm put-parameter \
    --name "/magikarp/dev/fred-api-key-5" \
    --value "$FRED_API_KEY_5" \
    --type "SecureString" \
    --overwrite \
    --description "FRED API Key #5 for parallel backfill"

echo "✅ All 5 FRED API keys uploaded successfully!"
echo ""
echo "You can now invoke Lambda with different API keys:"
echo "  apiKeyIndex: 1 (default)"
echo "  apiKeyIndex: 2"
echo "  apiKeyIndex: 3"
echo "  apiKeyIndex: 4"
echo "  apiKeyIndex: 5"
