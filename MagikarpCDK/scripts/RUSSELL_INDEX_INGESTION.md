# Russell Index Tracking - Documentation

## Overview

This system stores Russell 1000 index component data (stock symbols and company names) from CSV files into DynamoDB with timestamp-based tracking. This enables monitoring of index composition changes over time.

## Table of Contents

- [Architecture](#architecture)
- [Table Schema](#table-schema)
- [Deployment](#deployment)
- [Running the Ingestion Script](#running-the-ingestion-script)
- [Access Patterns](#access-patterns)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)

## Architecture

The system consists of two main components:

1. **DynamoDB Table** - Stores index composition data with timestamp tracking
2. **Ingestion Script** - Reads CSV files and writes data to DynamoDB

```
CSV File → Ingestion Script → DynamoDB Table
                                (timestamp, symbol, name)
```

## Table Schema

### Table Name
- Development: `dev-tmagikarp-russell-index`
- Production: `prod-tmagikarp-russell-index`

### Keys

| Key Type | Attribute | Type | Description |
|----------|-----------|------|-------------|
| Partition Key | `timestamp` | String | ISO 8601 date format (e.g., "2025-11-25") |
| Sort Key | `symbol` | String | Stock ticker symbol (e.g., "AAPL") |

### Attributes

| Attribute | Type | Description |
|-----------|------|-------------|
| `name` | String | Company name (e.g., "Apple Inc") |

### Example Item

```json
{
  "timestamp": "2025-11-25",
  "symbol": "AAPL",
  "name": "Apple Inc"
}
```

### Table Configuration

- **Billing Mode**: On-demand (pay-per-request)
- **Point-in-Time Recovery**: Enabled
- **Removal Policy**: Retain (table preserved on stack deletion)

## Deployment

### Prerequisites

- AWS CDK installed (`npm install -g aws-cdk`)
- AWS credentials configured
- Node.js and npm installed

### Deploy the CDK Stack

1. Navigate to the CDK directory:
```bash
cd MagikarpCDK
```

2. Install dependencies:
```bash
npm install
```

3. Deploy the stack (development environment):
```bash
cdk deploy --context environment=dev
```

4. Deploy to production:
```bash
cdk deploy --context environment=prod
```

### Verify Deployment

After deployment, the CDK will output the table name and ARN:

```
Outputs:
MagikarpCdkStack.RussellIndexTableName = dev-tmagikarp-russell-index
MagikarpCdkStack.RussellIndexTableArn = arn:aws:dynamodb:us-east-1:123456789012:table/dev-tmagikarp-russell-index
```

You can also verify the table exists in the AWS Console:
- Navigate to DynamoDB → Tables
- Look for `dev-tmagikarp-russell-index` or `prod-tmagikarp-russell-index`

## Running the Ingestion Script

### Prerequisites

- DynamoDB table deployed (see [Deployment](#deployment))
- AWS credentials configured with DynamoDB write permissions
- TypeScript and ts-node installed

### Install Script Dependencies

From the MagikarpCDK directory:

```bash
npm install
```

### Script Usage

```bash
ts-node scripts/ingest-russell-index.ts <csv-file-path> <timestamp> [table-name]
```

**Parameters:**
- `csv-file-path` (required): Path to the CSV file containing Russell index data
- `timestamp` (required): ISO 8601 date string (e.g., "2025-11-25")
- `table-name` (optional): DynamoDB table name (defaults to `RUSSELL_INDEX_TABLE_NAME` environment variable or "dev-tmagikarp-russell-index")

### CSV File Format

The CSV file must contain at least these columns:
- `Symbol`: Stock ticker symbol
- `Name`: Company name

Additional columns are ignored. Example:

```csv
Symbol,Name,Last,Change,%Change,Open,High,Low,Volume,Time
AAPL,"Apple Inc",275.92,4.43,+1.63%,270.9,277,270.9,65585703,2025-11-24
MSFT,"Microsoft Corp",420.55,5.12,+1.23%,415.43,421.00,415.00,28456789,2025-11-24
```

## Examples

### Example 1: Ingest Russell 1000 Index Data

Using the provided sample CSV file:

```bash
cd MagikarpCDK
ts-node scripts/ingest-russell-index.ts ../data/russell-1000-index-11-25-2025.csv 2025-11-25
```

**Expected Output:**
```
Starting Russell Index ingestion...
CSV File: ../data/russell-1000-index-11-25-2025.csv
Timestamp: 2025-11-25
Table Name: dev-tmagikarp-russell-index
Parsed 1000 items from CSV
Writing 1000 items in 40 batches
Batch 1/40 written successfully (25/1000 items)
Batch 2/40 written successfully (50/1000 items)
...
Batch 40/40 written successfully (1000/1000 items)
Successfully stored 1000 items to DynamoDB
Ingestion completed successfully!
```

### Example 2: Specify Custom Table Name

```bash
ts-node scripts/ingest-russell-index.ts \
  ../data/russell-1000-index-11-25-2025.csv \
  2025-11-25 \
  prod-tmagikarp-russell-index
```

### Example 3: Using Environment Variable

```bash
export RUSSELL_INDEX_TABLE_NAME=dev-tmagikarp-russell-index
ts-node scripts/ingest-russell-index.ts ../data/russell-1000-index-11-25-2025.csv 2025-11-25
```

### Example 4: Ingest Historical Data

To track index composition over time, run the script with different timestamps:

```bash
# Ingest data from November 2025
ts-node scripts/ingest-russell-index.ts ../data/russell-1000-2025-11.csv 2025-11-01

# Ingest data from December 2025
ts-node scripts/ingest-russell-index.ts ../data/russell-1000-2025-12.csv 2025-12-01
```

## Access Patterns

### Query 1: Get All Components for a Specific Date

Retrieve all stocks in the Russell 1000 on a specific date:

```typescript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const result = await client.send(new QueryCommand({
  TableName: 'dev-tmagikarp-russell-index',
  KeyConditionExpression: '#ts = :timestamp',
  ExpressionAttributeNames: {
    '#ts': 'timestamp'
  },
  ExpressionAttributeValues: {
    ':timestamp': '2025-11-25'
  }
}));

console.log(`Found ${result.Items.length} components`);
```

### Query 2: Get Specific Stock on a Date

Check if a specific stock was in the index on a given date:

```typescript
const result = await client.send(new QueryCommand({
  TableName: 'dev-tmagikarp-russell-index',
  KeyConditionExpression: '#ts = :timestamp AND symbol = :symbol',
  ExpressionAttributeNames: {
    '#ts': 'timestamp'
  },
  ExpressionAttributeValues: {
    ':timestamp': '2025-11-25',
    ':symbol': 'AAPL'
  }
}));

if (result.Items.length > 0) {
  console.log(`AAPL was in the index: ${result.Items[0].name}`);
}
```

### Query 3: Compare Index Composition Between Dates

Identify stocks added or removed from the index:

```typescript
// Get components for two different dates
const nov2025 = await getComponentsForDate('2025-11-01');
const dec2025 = await getComponentsForDate('2025-12-01');

// Find additions
const added = dec2025.filter(item => 
  !nov2025.some(old => old.symbol === item.symbol)
);

// Find removals
const removed = nov2025.filter(item => 
  !dec2025.some(current => current.symbol === item.symbol)
);

console.log(`Added: ${added.length} stocks`);
console.log(`Removed: ${removed.length} stocks`);
```

## Troubleshooting

### Error: "No items found in CSV file"

**Cause**: The CSV file is empty or doesn't contain Symbol and Name columns.

**Solution**: 
- Verify the CSV file has the correct format
- Ensure the header row contains "Symbol" and "Name" columns
- Check that there are data rows after the header

### Error: "ResourceNotFoundException: Requested resource not found"

**Cause**: The DynamoDB table doesn't exist or the table name is incorrect.

**Solution**:
- Verify the table was deployed: `aws dynamodb describe-table --table-name dev-tmagikarp-russell-index`
- Check the table name matches the deployed table
- Ensure you're using the correct AWS region

### Error: "AccessDeniedException"

**Cause**: AWS credentials don't have permission to write to DynamoDB.

**Solution**:
- Verify AWS credentials are configured: `aws sts get-caller-identity`
- Ensure the IAM user/role has `dynamodb:BatchWriteItem` permission
- Check the table's resource policy if using cross-account access

### Error: "ValidationException: One or more parameter values were invalid"

**Cause**: Invalid data format or missing required attributes.

**Solution**:
- Verify the timestamp is a valid string (not empty)
- Ensure all symbols and names are non-empty strings
- Check for special characters that might need escaping

### Slow Ingestion Performance

**Cause**: Network latency or throttling.

**Solution**:
- The script uses batch writes (25 items per request) for optimal performance
- For very large datasets, consider running from an EC2 instance in the same region
- Monitor CloudWatch metrics for throttling events

### Duplicate Data

**Cause**: Running the ingestion script multiple times with the same timestamp.

**Solution**:
- DynamoDB will overwrite items with the same partition key and sort key
- This is by design - re-running the script with the same timestamp updates the data
- To preserve historical snapshots, use different timestamps for each ingestion

## IAM Permissions

The ingestion script requires the following IAM permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:BatchWriteItem",
        "dynamodb:PutItem"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/*-russell-index"
    }
  ]
}
```

## Requirements Validation

This implementation satisfies the following requirements:

- **Requirement 1.1**: DynamoDB table created with timestamp (partition key) and symbol (sort key)
- **Requirement 1.2**: Table configured with on-demand billing mode
- **Requirement 2.1**: Script reads and parses CSV files
- **Requirement 2.2**: Script extracts Symbol and Name columns
- **Requirement 2.3**: Script includes timestamp attribute for each item
- **Requirement 2.4**: Script batches writes in groups of 25 or fewer
- **Requirement 2.5**: Script logs total count of items stored

## Additional Resources

- [AWS DynamoDB Documentation](https://docs.aws.amazon.com/dynamodb/)
- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [Russell 1000 Index Information](https://www.ftserussell.com/products/indices/russell-us)
