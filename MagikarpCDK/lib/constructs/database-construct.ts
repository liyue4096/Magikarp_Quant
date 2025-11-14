import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

/**
 * Properties for DatabaseConstruct
 */
export interface DatabaseConstructProps {
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
 * DatabaseConstruct
 * 
 * Encapsulates all DynamoDB table definitions for the Magikarp trading system.
 * Creates four tables: portfolio-state, recommendations, performance-metrics, and universe-metadata.
 */
export class DatabaseConstruct extends Construct {
    /**
     * Portfolio state table - stores current holdings and cash balance
     */
    public readonly portfolioStateTable: dynamodb.ITable;

    /**
     * Recommendations table - stores daily trading signals
     */
    public readonly recommendationsTable: dynamodb.ITable;

    /**
     * Performance metrics table - tracks daily portfolio performance
     */
    public readonly performanceMetricsTable: dynamodb.ITable;

    /**
     * Universe metadata table - stores stock metadata
     */
    public readonly universeMetadataTable: dynamodb.ITable;

    constructor(scope: Construct, id: string, props?: DatabaseConstructProps) {
        super(scope, id);

        // Determine table name prefix
        const prefix = props?.tableNamePrefix ||
            (props?.environment ? `${props.environment}-tmagikarp-` : 'tmagikarp-');

        // Get environment for tagging
        const environment = props?.environment || 'dev';

        // Portfolio State Table
        this.portfolioStateTable = new dynamodb.Table(this, 'PortfolioStateTable', {
            tableName: `${prefix}portfolio-state`,
            partitionKey: {
                name: 'id',
                type: dynamodb.AttributeType.STRING
            },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            pointInTimeRecoverySpecification: {
                pointInTimeRecoveryEnabled: true
            },
            removalPolicy: cdk.RemovalPolicy.RETAIN
        });

        // Apply tags to Portfolio State Table
        cdk.Tags.of(this.portfolioStateTable).add('Project', 'Magikarp');
        cdk.Tags.of(this.portfolioStateTable).add('Environment', environment);
        cdk.Tags.of(this.portfolioStateTable).add('ManagedBy', 'CDK');

        // Recommendations Table
        this.recommendationsTable = new dynamodb.Table(this, 'RecommendationsTable', {
            tableName: `${prefix}recommendations`,
            partitionKey: {
                name: 'date',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'symbol',
                type: dynamodb.AttributeType.STRING
            },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            pointInTimeRecoverySpecification: {
                pointInTimeRecoveryEnabled: true
            },
            timeToLiveAttribute: 'ttl',
            removalPolicy: cdk.RemovalPolicy.DESTROY
        });

        // Apply tags to Recommendations Table
        cdk.Tags.of(this.recommendationsTable).add('Project', 'Magikarp');
        cdk.Tags.of(this.recommendationsTable).add('Environment', environment);
        cdk.Tags.of(this.recommendationsTable).add('ManagedBy', 'CDK');

        // Performance Metrics Table
        this.performanceMetricsTable = new dynamodb.Table(this, 'PerformanceMetricsTable', {
            tableName: `${prefix}performance-metrics`,
            partitionKey: {
                name: 'date',
                type: dynamodb.AttributeType.STRING
            },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            pointInTimeRecoverySpecification: {
                pointInTimeRecoveryEnabled: true
            },
            removalPolicy: cdk.RemovalPolicy.RETAIN
        });

        // Apply tags to Performance Metrics Table
        cdk.Tags.of(this.performanceMetricsTable).add('Project', 'Magikarp');
        cdk.Tags.of(this.performanceMetricsTable).add('Environment', environment);
        cdk.Tags.of(this.performanceMetricsTable).add('ManagedBy', 'CDK');

        // Universe Metadata Table
        this.universeMetadataTable = new dynamodb.Table(this, 'UniverseMetadataTable', {
            tableName: `${prefix}universe-metadata`,
            partitionKey: {
                name: 'symbol',
                type: dynamodb.AttributeType.STRING
            },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            pointInTimeRecoverySpecification: {
                pointInTimeRecoveryEnabled: true
            },
            removalPolicy: cdk.RemovalPolicy.RETAIN
        });

        // Apply tags to Universe Metadata Table
        cdk.Tags.of(this.universeMetadataTable).add('Project', 'Magikarp');
        cdk.Tags.of(this.universeMetadataTable).add('Environment', environment);
        cdk.Tags.of(this.universeMetadataTable).add('ManagedBy', 'CDK');
    }
}
