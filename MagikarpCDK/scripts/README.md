# Setup Scripts

This directory contains utility scripts for managing the Magikarp CDK deployment.

## Available Scripts

### ingest-russell-index.ts

Ingests Russell 1000 index component data from CSV files into DynamoDB with timestamp tracking.

**Usage:**
```bash
ts-node ingest-russell-index.ts <csv-file-path> <timestamp> [table-name]
```

**Examples:**
```bash
# Ingest Russell 1000 data with default table name
ts-node ingest-russell-index.ts ../data/russell-1000-index-11-25-2025.csv 2025-11-25

# Specify custom table name
ts-node ingest-russell-index.ts ../data/russell-1000-index-11-25-2025.csv 2025-11-25 prod-tmagikarp-russell-index

# Use environment variable for table name
export RUSSELL_INDEX_TABLE_NAME=dev-tmagikarp-russell-index
ts-node ingest-russell-index.ts ../data/russell-1000-index-11-25-2025.csv 2025-11-25
```

**Features:**
- Parses CSV files with Symbol and Name columns
- Batch writes to DynamoDB (25 items per batch)
- Progress logging and error handling
- Timestamp-based tracking for historical analysis

**Requirements:**
- DynamoDB table deployed via CDK
- AWS credentials with DynamoDB write permissions
- CSV file with Symbol and Name columns

See [RUSSELL_INDEX_INGESTION.md](./RUSSELL_INDEX_INGESTION.md) for complete documentation.

---

### backfill-missing-data.sh

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
