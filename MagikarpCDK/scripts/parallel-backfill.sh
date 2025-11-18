#!/bin/bash

# Script to run 5 parallel Lambda invocations for backfill
# Each uses a different FRED API key to avoid rate limits
# Usage: ./scripts/parallel-backfill.sh

set -e

FUNCTION_NAME="dev-magikarp-macro-ingestion"

echo "Starting parallel backfill with 5 Lambda invocations..."
echo "Each Lambda will use a different FRED API key"
echo ""

# Year 2020 - API Key 1
echo "Starting backfill for 2020 (API Key 1)..."
aws lambda invoke \
  --function-name $FUNCTION_NAME \
  --payload '{"action":"backfill","startDate":"2020-01-01","endDate":"2020-12-31","apiKeyIndex":1}' \
  --cli-binary-format raw-in-base64-out \
  response_2020.json &
PID1=$!

# Year 2021 - API Key 2
echo "Starting backfill for 2021 (API Key 2)..."
aws lambda invoke \
  --function-name $FUNCTION_NAME \
  --payload '{"action":"backfill","startDate":"2021-01-01","endDate":"2021-12-31","apiKeyIndex":2}' \
  --cli-binary-format raw-in-base64-out \
  response_2021.json &
PID2=$!

# Year 2022 - API Key 3
echo "Starting backfill for 2022 (API Key 3)..."
aws lambda invoke \
  --function-name $FUNCTION_NAME \
  --payload '{"action":"backfill","startDate":"2022-01-01","endDate":"2022-12-31","apiKeyIndex":3}' \
  --cli-binary-format raw-in-base64-out \
  response_2022.json &
PID3=$!

# Year 2023 - API Key 4
echo "Starting backfill for 2023 (API Key 4)..."
aws lambda invoke \
  --function-name $FUNCTION_NAME \
  --payload '{"action":"backfill","startDate":"2023-01-01","endDate":"2023-12-31","apiKeyIndex":4}' \
  --cli-binary-format raw-in-base64-out \
  response_2023.json &
PID4=$!

# Year 2024 - API Key 5
echo "Starting backfill for 2024 (API Key 5)..."
aws lambda invoke \
  --function-name $FUNCTION_NAME \
  --payload '{"action":"backfill","startDate":"2024-01-01","endDate":"2024-12-31","apiKeyIndex":5}' \
  --cli-binary-format raw-in-base64-out \
  response_2024.json &
PID5=$!

echo ""
echo "All 5 Lambda invocations started!"
echo "Waiting for completion..."
echo ""

# Wait for all background jobs to complete
wait $PID1 && echo "✅ 2020 backfill complete"
wait $PID2 && echo "✅ 2021 backfill complete"
wait $PID3 && echo "✅ 2022 backfill complete"
wait $PID4 && echo "✅ 2023 backfill complete"
wait $PID5 && echo "✅ 2024 backfill complete"

echo ""
echo "🎉 All backfills complete!"
echo ""
echo "Results:"
cat response_2020.json | jq '.'
cat response_2021.json | jq '.'
cat response_2022.json | jq '.'
cat response_2023.json | jq '.'
cat response_2024.json | jq '.'
