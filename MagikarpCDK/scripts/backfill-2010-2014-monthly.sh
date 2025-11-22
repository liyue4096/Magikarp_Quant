#!/bin/bash

# Historical backfill script: 2010-2014 (Monthly with cooldown)
# 
# Strategy:
# - Process 1 month at a time per API key
# - 5 API keys process 5 months in parallel
# - After each batch completes, wait 60s before next batch
# - This respects FRED's 120 req/min rate limit
#
# Usage: ./scripts/backfill-2010-2014-monthly.sh [environment]

set -e

# Parse environment argument (default: dev)
ENV=${1:-dev}
FUNCTION_NAME="${ENV}-magikarp-macro-ingestion"

echo "=========================================="
echo "Historical Backfill: 2010-2014 (Monthly)"
echo "Environment: $ENV"
echo "Function: $FUNCTION_NAME"
echo "=========================================="
echo ""
echo "Strategy: 1 month per Lambda, 60s cooldown between batches"
echo "5 API keys process 5 months in parallel"
echo "Total: 60 months (5 years × 12 months)"
echo "Each month: ~20 days with 45s delays = ~3-4 min per month"
echo "Expected runtime: ~1.5 hours"
echo ""

# Create output directory for responses
mkdir -p backfill_responses

# Function to process one month
process_month() {
    local year=$1
    local month=$2
    local api_key=$3
    local month_label=$(printf "%04d-%02d" $year $month)
    
    # Calculate start and end dates
    local start_date=$(printf "%04d-%02d-01" $year $month)
    
    # Calculate end date (last day of month)
    case $month in
        1|3|5|7|8|10|12) local last_day=31 ;;
        4|6|9|11) local last_day=30 ;;
        2) 
            # Check for leap year
            if [ $((year % 4)) -eq 0 ] && { [ $((year % 100)) -ne 0 ] || [ $((year % 400)) -eq 0 ]; }; then
                local last_day=29
            else
                local last_day=28
            fi
            ;;
    esac
    local end_date=$(printf "%04d-%02d-%02d" $year $month $last_day)
    
    echo "[$month_label] Processing with API Key $api_key: $start_date to $end_date"
    
    # Invoke Lambda
    aws lambda invoke \
      --function-name $FUNCTION_NAME \
      --payload "{\"action\":\"backfill\",\"startDate\":\"$start_date\",\"endDate\":\"$end_date\",\"apiKeyIndex\":$api_key}" \
      --cli-binary-format raw-in-base64-out \
      "backfill_responses/response_${month_label}.json" > /dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        if command -v jq &> /dev/null; then
            local success=$(jq -r '.successCount // 0' "backfill_responses/response_${month_label}.json" 2>/dev/null || echo "0")
            local failure=$(jq -r '.failureCount // 0' "backfill_responses/response_${month_label}.json" 2>/dev/null || echo "0")
            echo "  ✅ $month_label: $success successes, $failure failures"
        else
            echo "  ✅ $month_label: Complete"
        fi
    else
        echo "  ❌ $month_label: Failed"
    fi
}

# Process all months from 2010-2014
# We'll process 5 months at a time (one per API key), then wait 60s

month_counter=0
total_months=60

for year in 2010 2011 2012 2013 2014; do
    for month in {1..12}; do
        # Determine which API key to use (rotate 1-5)
        api_key=$(( (month_counter % 5) + 1 ))
        
        # Process this month in background
        process_month $year $month $api_key &
        
        month_counter=$((month_counter + 1))
        
        # After every 5 months (one per API key), wait for them to complete
        # then add 60s cooldown before next batch
        if [ $((month_counter % 5)) -eq 0 ]; then
            echo ""
            echo "Waiting for batch to complete..."
            wait
            
            if [ $month_counter -lt $total_months ]; then
                echo "✅ Batch complete. Cooling down for 60 seconds..."
                echo "Progress: $month_counter/$total_months months complete"
                sleep 60
                echo ""
            fi
        fi
    done
done

# Wait for any remaining processes
wait

echo ""
echo "=========================================="
echo "🎉 All backfills complete!"
echo "=========================================="
echo ""

# Display summary
if command -v jq &> /dev/null; then
    echo "📊 Final Statistics:"
    total_success=0
    total_failure=0
    
    for file in backfill_responses/response_*.json; do
        if [ -f "$file" ]; then
            success=$(jq -r '.successCount // 0' "$file" 2>/dev/null || echo "0")
            failure=$(jq -r '.failureCount // 0' "$file" 2>/dev/null || echo "0")
            total_success=$((total_success + success))
            total_failure=$((total_failure + failure))
        fi
    done
    
    echo "  Total successful days: $total_success"
    echo "  Total failed days: $total_failure"
    
    if [ $((total_success + total_failure)) -gt 0 ]; then
        success_rate=$(awk "BEGIN {printf \"%.1f\", ($total_success/($total_success+$total_failure))*100}")
        echo "  Success rate: ${success_rate}%"
    fi
else
    echo "Install 'jq' to see summary statistics"
fi

echo ""
echo "Response files saved in: backfill_responses/"
