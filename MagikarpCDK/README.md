# Magikarp CDK

AWS CDK infrastructure for the Magikarp trading system. Deploys DynamoDB tables and Lambda functions for macro data ingestion.

## Quick Start

### 1. Setup API Keys

```bash
# Create environment files
echo "FRED_API_KEY=your_key_here" > .env.dev
echo "FRED_API_KEY=your_key_here" > .env.prod

# Upload to AWS SSM Parameter Store
./scripts/setup-api-keys.sh dev
./scripts/setup-api-keys.sh prod
```

### 2. Deploy

```bash
# Install dependencies
npm install

# Deploy to dev
cdk deploy --context environment=dev

# Deploy to prod
cdk deploy --context environment=prod
```

### 3. Backfill Data

```bash
# Scan for missing data
./scripts/backfill-missing-data.sh dev --scan-only

# Review missing_dates.txt, then backfill
./scripts/backfill-missing-data.sh dev --from-file missing_dates.txt
```

## Project Structure

```
MagikarpCDK/
├── bin/                    # CDK app entry point
├── lib/                    # CDK stack definitions
│   └── constructs/        # Reusable CDK constructs
├── lambda/                # Lambda function code
│   └── macro-data-ingestion/
└── scripts/               # Utility scripts
```

## Commands

```bash
npm run build      # Compile TypeScript
npm run test       # Run tests
cdk deploy         # Deploy stack
cdk diff           # Show changes
cdk synth          # Generate CloudFormation
```

## Documentation

- [Lambda Function](./lambda/macro-data-ingestion/README.md) - Macro data ingestion details
- [Russell Index Tracking](./scripts/RUSSELL_INDEX_INGESTION.md) - Russell 1000 index data ingestion
- [Scripts](./scripts/README.md) - Available utility scripts
- [API Setup Guide](../doc/API_KEY_SETUP_GUIDE.md) - Detailed API key configuration

## Environment Variables

The stack uses `.env.{environment}` files for configuration:
- `.env.dev` - Development environment
- `.env.prod` - Production environment

These files are gitignored and contain sensitive API keys.
