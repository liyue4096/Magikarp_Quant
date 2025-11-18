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

    /**
     * Macroeconomic indicators table - stores daily macroeconomic data
     */
    public readonly macroIndicatorsTable: dynamodb.ITable;

    constructor(scope: Construct, id: string, props?: DatabaseConstructProps) {
        super(scope, id);

        // Determine table name prefix
        const prefix = props?.tableNamePrefix ||
            (props?.environment ? `${props.environment}-tmagikarp-` : 'tmagikarp-');

        // Get environment for tagging
        const environment = props?.environment || 'dev';

        // Portfolio State Table - Import existing table
        this.portfolioStateTable = dynamodb.Table.fromTableName(
            this,
            'PortfolioStateTable',
            `${prefix}portfolio-state`
        );

        // Recommendations Table - Import existing table
        this.recommendationsTable = dynamodb.Table.fromTableName(
            this,
            'RecommendationsTable',
            `${prefix}recommendations`
        );

        // Performance Metrics Table - Import existing table
        this.performanceMetricsTable = dynamodb.Table.fromTableName(
            this,
            'PerformanceMetricsTable',
            `${prefix}performance-metrics`
        );

        // Universe Metadata Table - Import existing table
        this.universeMetadataTable = dynamodb.Table.fromTableName(
            this,
            'UniverseMetadataTable',
            `${prefix}universe-metadata`
        );

        // Macroeconomic Indicators Table - Import existing table
        this.macroIndicatorsTable = dynamodb.Table.fromTableName(
            this,
            'MacroIndicatorsTable',
            `${prefix}macro-indicators`
        );
    }
}
