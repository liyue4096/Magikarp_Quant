#!/bin/bash
# Scan DynamoDB for missing data and backfill with API key rotation
#
# Usage:
#   ./scripts/backfill-missing-data.sh [dev|prod] [--scan-only|--dry-run|--from-file FILE] [--include-optional]
#
# Examples:
#   ./scripts/backfill-missing-data.sh dev --scan-only                    # Just scan and save to file
#   ./scripts/backfill-missing-data.sh dev --scan-only --include-optional # Include CPI/GDP checks
#   ./scripts/backfill-missing-data.sh dev --dry-run                      # Dry run
#   ./scripts/backfill-missing-data.sh dev                                # Actually backfill
#   ./scripts/backfill-missing-data.sh dev --from-file dates.txt          # Backfill from file

set -e

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Default environment
ENVIRONMENT="${1:-dev}"
MODE_FLAG=""
OPTIONAL_FLAG=""

# Check for --include-optional flag
for arg in "$@"; do
    if [ "$arg" == "--include-optional" ]; then
        OPTIONAL_FLAG="--include-optional"
        echo "📊 Including optional fields (CPI, GDP) in checks"
    fi
done

# Check for mode flags
if [ "$2" == "--scan-only" ] || [ "$1" == "--scan-only" ]; then
    MODE_FLAG="--scan-only"
    echo "🔍 SCAN ONLY MODE - Will save missing dates to file"
elif [ "$2" == "--dry-run" ] || [ "$1" == "--dry-run" ]; then
    MODE_FLAG="--dry-run"
    echo "🔍 DRY RUN MODE - No actual backfill will be performed"
elif [ "$2" == "--from-file" ]; then
    MODE_FLAG="--from-file $3"
    echo "📄 BACKFILL FROM FILE MODE - Reading dates from $3"
elif [ "$1" == "--from-file" ]; then
    MODE_FLAG="--from-file $2"
    echo "📄 BACKFILL FROM FILE MODE - Reading dates from $2"
    ENVIRONMENT="dev"
fi

echo "Environment: $ENVIRONMENT"
echo ""

# Check if Python 3 is available
if ! command -v python3 &> /dev/null; then
    echo "❌ Error: python3 is required but not installed"
    exit 1
fi

# Check if boto3 is installed
if ! python3 -c "import boto3" 2>/dev/null; then
    echo "❌ Error: boto3 is required but not installed"
    echo ""
    echo "Install options:"
    echo "  1. System package:  sudo apt install python3-boto3"
    echo "  2. User install:    pip3 install --user boto3"
    echo "  3. Virtual env:     python3 -m venv ~/venv && source ~/venv/bin/activate && pip install boto3"
    echo ""
    exit 1
fi

# Run Python script
python3 "$SCRIPT_DIR/backfill-missing-data.py" \
    --environment "$ENVIRONMENT" \
    --start-date "2000-01-01" \
    --end-date "2025-11-01" \
    $MODE_FLAG \
    $OPTIONAL_FLAG
