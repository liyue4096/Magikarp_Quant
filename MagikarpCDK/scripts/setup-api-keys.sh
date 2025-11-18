#!/bin/bash

# Setup script for uploading API keys to AWS SSM Parameter Store
# This script reads API keys from a local .env file and uploads them to SSM
# The .env file should NEVER be committed to Git

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="${1:-dev}"
REGION="${AWS_REGION:-us-west-2}"
ENV_FILE=".env.${ENVIRONMENT}"

echo -e "${GREEN}=== Magikarp API Key Setup ===${NC}"
echo "Environment: ${ENVIRONMENT}"
echo "Region: ${REGION}"
echo "Env File: ${ENV_FILE}"
echo ""

# Check if .env file exists
if [ ! -f "${ENV_FILE}" ]; then
    echo -e "${RED}Error: ${ENV_FILE} not found!${NC}"
    echo ""
    echo "Please create ${ENV_FILE} with the following format:"
    echo ""
    echo "FRED_API_KEY=your_fred_api_key_here"
    echo ""
    echo "Example:"
    echo "  FRED_API_KEY=abcdef1234567890abcdef1234567890"
    echo ""
    exit 1
fi

# Source the .env file
echo -e "${YELLOW}Loading API keys from ${ENV_FILE}...${NC}"
source "${ENV_FILE}"

# Validate required variables
if [ -z "${FRED_API_KEY}" ]; then
    echo -e "${RED}Error: FRED_API_KEY not found in ${ENV_FILE}${NC}"
    exit 1
fi

echo -e "${GREEN}✓ API keys loaded successfully${NC}"
echo ""

# Upload FRED API key to SSM Parameter Store
PARAMETER_NAME="/magikarp/${ENVIRONMENT}/fred-api-key"
echo -e "${YELLOW}Uploading FRED API key to SSM Parameter Store...${NC}"
echo "Parameter: ${PARAMETER_NAME}"

aws ssm put-parameter \
    --name "${PARAMETER_NAME}" \
    --value "${FRED_API_KEY}" \
    --type "SecureString" \
    --overwrite \
    --region "${REGION}" \
    --description "FRED API key for Magikarp macro data ingestion (${ENVIRONMENT})" \
    > /dev/null

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ FRED API key uploaded successfully${NC}"
else
    echo -e "${RED}✗ Failed to upload FRED API key${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}=== Setup Complete ===${NC}"
echo ""
echo "Your API keys are now stored securely in AWS SSM Parameter Store."
echo "The Lambda function will automatically fetch them on initialization."
echo ""
echo "To verify:"
echo "  aws ssm get-parameter --name \"${PARAMETER_NAME}\" --with-decryption --region ${REGION}"
echo ""
