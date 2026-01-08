import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

/**
 * Properties for RussellIndexTableConstruct
 */
export interface RussellIndexTableConstructProps {
    /**
     * Environment name (dev, staging, prod)
     * Used for table name prefixing and tagging
     */
    environment?: string;

    /**
     * Optional prefix for table names
     * If not provided, will be derived from environment
     */
    tableNamePrefix?: string;
}

/**
 * RussellIndexTableConstruct
 * 
 * Creates a DynamoDB table for storing Russell 1000 index component data
 * with timestamp-based tracking to monitor index composition over time.
 * 
 * Table Schema:
 * - Partition Key: timestamp (String) - ISO 8601 format date (e.g., "2025-11-25")
 * - Sort Key: symbol (String) - Stock ticker symbol
 * - Attributes: name (String) - Company name
 * 
 * Requirements: 1.1, 1.2
 */
export class RussellIndexTableConstruct extends Construct {
    /**
     * Russell index table - stores index components with timestamp tracking
     */
    public readonly table: dynamodb.Table;

    /**
     * Table name for use by ingestion scripts
     */
    public readonly tableName: string;

    /**
     * Table ARN for IAM permissions
     */
    public readonly tableArn: string;

    constructor(scope: Construct, id: string, props?: RussellIndexTableConstructProps) {
        super(scope, id);

        // Determine table name prefix
        const prefix = props?.tableNamePrefix ||
            (props?.environment ? `${props.environment}-tmagikarp-` : 'tmagikarp-');

        // Get environment for tagging
        const environment = props?.environment || 'dev';

        // Create Russell Index Table
        // Requirements: 1.1 - Create table with timestamp (partition key) and symbol (sort key)
        // Requirements: 1.2 - Configure on-demand billing mode
        this.table = new dynamodb.Table(this, 'RussellIndexTable', {
            tableName: `${prefix}russell-index`,
            partitionKey: {
                name: 'timestamp',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'symbol',
                type: dynamodb.AttributeType.STRING
            },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, // On-demand billing
            removalPolicy: cdk.RemovalPolicy.RETAIN, // Retain table on stack deletion
            pointInTimeRecovery: true, // Enable point-in-time recovery for data protection
        });

        // Tag the table with environment
        cdk.Tags.of(this.table).add('Environment', environment);
        cdk.Tags.of(this.table).add('Purpose', 'Russell Index Tracking');

        // Export table name and ARN for use by other constructs
        this.tableName = this.table.tableName;
        this.tableArn = this.table.tableArn;

        // Create CloudFormation outputs for easy reference
        new cdk.CfnOutput(this, 'RussellIndexTableName', {
            value: this.table.tableName,
            description: 'Name of the Russell Index DynamoDB table',
            exportName: `${prefix}russell-index-table-name`
        });

        new cdk.CfnOutput(this, 'RussellIndexTableArn', {
            value: this.table.tableArn,
            description: 'ARN of the Russell Index DynamoDB table',
            exportName: `${prefix}russell-index-table-arn`
        });
    }
}
