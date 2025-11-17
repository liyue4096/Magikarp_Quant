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
- `FRED_API_KEY` - API key for FRED API
- `ALPHA_VANTAGE_API_KEY` - API key for Alpha Vantage
- `MACRO_INDICATORS_TABLE` - DynamoDB table name
- `AWS_REGION` - AWS region (default: us-west-2)

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

## Development Status

This is the initial project structure. Implementation tasks are tracked in `.kiro/specs/macro-data-ingestion/tasks.md`.
