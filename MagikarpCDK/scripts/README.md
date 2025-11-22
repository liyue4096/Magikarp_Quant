# Setup Scripts

This directory contains utility scripts for managing the Magikarp CDK deployment.

## Available Scripts

### backfill-missing-data.sh (NEW!)

Scans DynamoDB for missing or incomplete macro data and backfills it with API key rotation.

**Usage:**
```bash
./backfill-missing-data.sh [environment] [--dry-run]
```

**Examples:**
```bash
# Dry run to see what would be backfilled
./backfill-missing-data.sh dev --dry-run

# Actually backfill missing data
./backfill-missing-data.sh dev

# Backfill in production
./backfill-missing-data.sh prod
```

**Features:**
- Identifies missing dates (not in DB) and incomplete records (missing required fields)
- Rotates through 5 FRED API keys automatically
- Rate limiting: 100 requests per key, then 10-minute break
- Real-time progress tracking

**Requirements:**
- Python 3 with boto3: `pip3 install boto3`
- AWS CLI configured
- Lambda function deployed

See [BACKFILL_MISSING_DATA.md](./BACKFILL_MISSING_DATA.md) for detailed documentation.

---

### setup-api-keys.sh

Uploads API keys from local .env files to AWS SSM Parameter Store.

**Usage:**
```bash
./setup-api-keys.sh [environment]
```

**Arguments:**
- `environment` (optional): Environment name (default: `dev`)
  - Valid values: `dev`, `staging`, `prod`

**Examples:**
```bash
# Upload dev API keys
./setup-api-keys.sh dev

# Upload prod API keys
./setup-api-keys.sh prod

# Use custom AWS region
AWS_REGION=us-east-1 ./setup-api-keys.sh dev
```

**Requirements:**
- AWS CLI installed and configured
- `.env.{environment}` file exists with API keys
- IAM permissions: `ssm:PutParameter`

**Environment File Format:**
```bash
FRED_API_KEY=your_api_key_here
```

See [API_KEY_SETUP_GUIDE.md](../API_KEY_SETUP_GUIDE.md) for detailed instructions.
