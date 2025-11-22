# Backfill Missing Data Script

This script scans your DynamoDB table for missing or incomplete macro data and backfills it using the Lambda function with API key rotation and rate limiting.

## Features

- **Smart Detection**: Identifies both missing dates and incomplete records
- **API Key Rotation**: Rotates through 5 FRED API keys automatically
- **Rate Limiting**: 100 requests per key, then 10-minute break
- **Dry Run Mode**: Test without actually backfilling data
- **Progress Tracking**: Real-time progress updates

## Prerequisites

### Install boto3

Choose one of these methods:

**Option 1: System package (Recommended for Ubuntu/Debian)**
```bash
sudo apt update
sudo apt install python3-boto3
```

**Option 2: Virtual environment**
```bash
# Create virtual environment
python3 -m venv ~/venv-magikarp
source ~/venv-magikarp/bin/activate
pip install boto3

# Run script with venv
~/venv-magikarp/bin/python3 scripts/backfill-missing-data.py --environment dev
```

**Option 3: pipx (for isolated installation)**
```bash
sudo apt install pipx
pipx install boto3
```

**Option 4: User install (if you must)**
```bash
pip3 install --user boto3
```

### Configure AWS credentials
```bash
aws configure
```

## Usage

### Basic Usage

**Recommended workflow for testing:**

```bash
# Step 1: Scan and save missing dates to file (no backfill)
./scripts/backfill-missing-data.sh dev --scan-only

# Step 2: Review the generated file
cat missing_dates.txt

# Step 3: Backfill from the file
./scripts/backfill-missing-data.sh dev --from-file missing_dates.txt
```

**Alternative: Direct backfill (skip file)**

```bash
# Dry run to see what would be backfilled
./scripts/backfill-missing-data.sh dev --dry-run

# Actually backfill missing data in dev
./scripts/backfill-missing-data.sh dev

# Backfill in production
./scripts/backfill-missing-data.sh prod
```

### Advanced Usage

```bash
# Scan only with custom output file
python3 scripts/backfill-missing-data.py \
    --environment dev \
    --scan-only \
    --output-file my_missing_dates.txt

# Backfill from custom file
python3 scripts/backfill-missing-data.py \
    --environment dev \
    --from-file my_missing_dates.txt

# Custom date range
python3 scripts/backfill-missing-data.py \
    --environment dev \
    --start-date 2020-01-01 \
    --end-date 2023-12-31 \
    --scan-only
```

## Two-Step Workflow (Recommended)

### Step 1: Scan and Save (`--scan-only`)

First, scan your DynamoDB table and save missing dates to a file:

```bash
./scripts/backfill-missing-data.sh dev --scan-only
```

This will:
- Scan your DynamoDB table
- Identify missing and incomplete dates
- Save them to `missing_dates.txt`
- **NOT** perform any backfill

The generated file looks like:
```
# Missing and Incomplete Dates for Backfill
# Generated: 2024-11-21 14:30:00
# Total dates: 1343
#
2000-01-03 # missing
2000-01-04 # missing
2024-10-15 # incomplete
...
```

### Step 2: Review and Backfill (`--from-file`)

Review the file, edit if needed (remove dates you don't want to backfill), then run:

```bash
./scripts/backfill-missing-data.sh dev --from-file missing_dates.txt
```

This will:
- Read dates from the file
- Backfill each date using Lambda
- Rotate through API keys automatically

**Benefits of this approach:**
- ✅ Review what will be backfilled before running
- ✅ Edit the file to exclude certain dates
- ✅ Resume from where you left off if interrupted
- ✅ Separate scan time from backfill time

## How It Works

1. **Generate Trading Days**: Creates list of all trading days (excluding weekends) from 2000-01-01 to 2025-11-01

2. **Scan DynamoDB**: Scans the table to find:
   - Dates that don't exist in the table at all
   - Records with missing required fields (interest_rate, vix, dxy, treasury_2y, treasury_10y, yield_curve_spread, ice_bofa_bbb)

3. **Save or Backfill**: 
   - `--scan-only`: Saves dates to file for review
   - `--from-file`: Reads dates from file and backfills
   - Default: Scans and backfills immediately

4. **Backfill Process**: For each missing/incomplete date:
   - Invokes Lambda function with specific API key
   - Rotates through 5 API keys (100 requests each)
   - Takes 10-minute break after exhausting all keys
   - Adds 2-second delay between requests

## Required Fields

The script checks for these required fields:
- `interest_rate` - Federal Funds Rate
- `vix` - Volatility Index
- `dxy` - US Dollar Index
- `treasury_2y` - 2-Year Treasury Yield
- `treasury_10y` - 10-Year Treasury Yield
- `yield_curve_spread` - 10Y-2Y Spread
- `ice_bofa_bbb` - ICE BofA BBB Corporate Bond Yield

Optional fields (monthly data):
- `gdp_growth` - GDP Growth Rate
- `cpi` - Consumer Price Index
- `cpi_yoy` - CPI Year-over-Year Change

## Rate Limiting

To respect FRED API limits (120 requests/minute):
- Each date requires ~8 FRED API calls
- 100 dates = 800 API calls per key
- With 5 keys, you can process 500 dates before the 10-minute break
- After the break, the cycle repeats

## Example Output

```
============================================================
SCAN AND BACKFILL MISSING DATA
============================================================
Environment: dev
Dry run: False
Date range: 2000-01-01 to 2025-11-01
API keys: 5
Requests per key: 100
Break duration: 10 minutes
============================================================

Table: dev-tmagikarp-macro-indicators
Function: dev-magikarp-macro-ingestion

Generating list of trading days...
Generated 6532 trading days
Scanning table dev-tmagikarp-macro-indicators for existing dates...
  Scanned 5000 dates so far...
Scan complete. Found 5234 existing dates
Querying table dev-tmagikarp-macro-indicators for incomplete records...
  Found 45 incomplete records so far...
Query complete. Found 45 incomplete records

============================================================
SUMMARY
============================================================
Total trading days in range: 6532
Existing records: 5234
Missing dates (not in DB): 1298
Incomplete records: 45
Total dates to backfill: 1343
============================================================

First 20 dates to backfill:
  2000-01-03 (missing)
  2000-01-04 (missing)
  ...

Starting backfill process for 1343 dates...

[1/1343] Processing 2000-01-03
  Using API key 1 (request 1/100)
  ✓ Success

[2/1343] Processing 2000-01-04
  Using API key 1 (request 2/100)
  ✓ Success

...

⚠️  Reached 100 requests with API key 1
   Rotating to API key 2

...

⏸️  All 5 API keys exhausted. Taking a 10-minute break...
   Break will end at: 14:35:22

▶️  Break complete. Resuming with API key 1

...

============================================================
BACKFILL COMPLETE
============================================================
Total dates processed: 1343
Successful: 1298
Failed: 45
Success rate: 96.6%
```

## Troubleshooting

### Script hangs during scan
- DynamoDB scan can take time for large tables
- Be patient, progress is shown every few seconds

### Lambda invocation fails
- Check Lambda function exists: `aws lambda get-function --function-name dev-magikarp-macro-ingestion`
- Verify IAM permissions to invoke Lambda
- Check CloudWatch logs for Lambda errors

### API rate limit errors
- The script should handle this automatically with breaks
- If you see persistent errors, increase `BREAK_DURATION_SECONDS` in the Python script

### Missing boto3
```bash
pip3 install boto3
```

## Configuration

Edit `backfill-missing-data.py` to adjust:
- `API_KEY_COUNT`: Number of API keys (default: 5)
- `REQUESTS_PER_KEY`: Requests before rotation (default: 100)
- `BREAK_DURATION_SECONDS`: Break time in seconds (default: 600 = 10 minutes)
- `DELAY_BETWEEN_REQUESTS`: Delay between Lambda calls (default: 2 seconds)

## See Also

- [API Key Setup Guide](../doc/API_KEY_SETUP_GUIDE.md)
- [Lambda Function README](../lambda/macro-data-ingestion/README.md)
- [Parallel Backfill Script](./parallel-backfill.sh) - For initial bulk backfill
