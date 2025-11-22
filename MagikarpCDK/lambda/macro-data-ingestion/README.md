# Macro Data Ingestion Lambda Function

This Lambda function fetches daily macroeconomic indicators from FRED API, Yahoo Finance, and Alpha Vantage, validates the data, and stores it in the DynamoDB macro-indicators table.

## Project Structure

```
macro-data-ingestion/
├── index.ts                    # Lambda handler entry point
├── service.ts                  # Main service orchestration class
├── types.ts                    # TypeScript interfaces and types
├── validation.ts               # Data validation logic
├── clients/
│   ├── fred-client.ts         # FRED API client
│   ├── yahoo-client.ts        # Yahoo Finance client
│   └── alpha-vantage-client.ts # Alpha Vantage client
├── package.json               # Dependencies
├── tsconfig.json              # TypeScript configuration
└── README.md                  # This file
```

## Setup

Install dependencies:
```bash
npm install
```

Build TypeScript:
```bash
npm run build
```

## Environment Variables

Required environment variables:
- `FRED_API_KEY_PARAMETER` - SSM Parameter Store name for FRED API key (e.g., `/magikarp/dev/fred-api-key`)
- `MACRO_INDICATORS_TABLE` - DynamoDB table name
- `AWS_REGION` - AWS region (default: us-west-2)

## API Key Management

### SSM Parameter Store (Recommended)

The Lambda function fetches the FRED API key from AWS Systems Manager Parameter Store on initialization. This provides:
- Secure storage with KMS encryption
- Automatic caching to avoid repeated SSM calls
- Easy key rotation without redeploying the Lambda function

#### Setting up the FRED API Key

After deploying the CDK stack, you need to update the SSM Parameter with your actual FRED API key:

```bash
# For dev environment
aws ssm put-parameter \
  --name "/magikarp/dev/fred-api-key" \
  --value "YOUR_FRED_API_KEY" \
  --type "SecureString" \
  --overwrite

# For prod environment
aws ssm put-parameter \
  --name "/magikarp/prod/fred-api-key" \
  --value "YOUR_FRED_API_KEY" \
  --type "SecureString" \
  --overwrite
```

#### Retrieving the Parameter Name

The CDK stack outputs the parameter name after deployment:
```bash
# Get the parameter name from CDK outputs
aws cloudformation describe-stacks \
  --stack-name MagikarpCdkStack \
  --query "Stacks[0].Outputs[?OutputKey=='FredApiKeyParameterName'].OutputValue" \
  --output text
```

### Legacy: Environment Variables

For local testing or backward compatibility, you can also provide the FRED API key directly via environment variables:
- `FRED_API_KEY` - API key for FRED API (not recommended for production)

## Usage

### Daily Fetch
```json
{
  "date": "2024-01-15"
}
```

### Backfill
```json
{
  "action": "backfill",
  "startDate": "2024-01-01",
  "endDate": "2024-01-31"
}
```

## Documentation

- [API Key Setup Guide](../../../doc/API_KEY_SETUP_GUIDE.md) - Complete API key configuration
- [Scripts](../../scripts/README.md) - Utility scripts for backfilling and setup

## Development Status

Implementation tasks are tracked in `.kiro/specs/macro-data-ingestion/tasks.md`.
