import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';
import * as path from 'path';

/**
 * Properties for MacroIngestionConstruct
 */
export interface MacroIngestionConstructProps {
    /**
     * DynamoDB table for storing macro indicators
     */
    macroIndicatorsTable: dynamodb.ITable;

    /**
     * Environment name (dev, staging, prod)
     * Used for tagging and configuration
     */
    environment?: string;

    /**
     * AWS Secrets Manager secret containing API keys
     * Expected to contain: FRED_API_KEY
     * Optional - if not provided, Lambda will attempt to read from environment variables
     */
    apiKeysSecret?: secretsmanager.ISecret;
}

/**
 * MacroIngestionConstruct
 * 
 * Creates a Lambda function for ingesting macroeconomic data from FRED and Yahoo Finance.
 * The Lambda function fetches daily economic indicators and stores them in DynamoDB.
 * 
 * Features:
 * - Daily data fetch for current date
 * - Historical backfill for date ranges
 * - Automatic retry logic with exponential backoff
 * - Data validation and quality checks
 * - Scheduled daily execution via EventBridge
 * - Secure API key storage in SSM Parameter Store
 * 
 * Requirements: 7.1, 7.2, 9.1, 9.2, 9.3, 9.4, 9.5
 */
export class MacroIngestionConstruct extends Construct {
    /**
     * Lambda function for macro data ingestion
     * Exposed for EventBridge scheduling and manual invocation
     */
    public readonly lambdaFunction: nodejs.NodejsFunction;

    /**
     * EventBridge rule for daily scheduled execution
     */
    public readonly dailyScheduleRule: events.Rule;

    /**
     * SSM Parameter for FRED API key
     * Exposed for manual updates and reference
     */
    public readonly fredApiKeyParameter: ssm.IStringParameter;

    constructor(scope: Construct, id: string, props: MacroIngestionConstructProps) {
        super(scope, id);

        // Get environment for tagging
        const environment = props.environment || 'dev';

        // Reference existing SSM Parameter for FRED API key (Requirement 9.1, 9.2, 9.5)
        // The parameter exists outside CDK (created manually or in previous deployment)
        // We just need to pass the parameter name to Lambda and grant read permissions
        // Parameter name: /magikarp/{environment}/fred-api-key
        const parameterName = `/magikarp/${environment}/fred-api-key`;

        // Create a reference to the parameter for granting permissions
        // Using fromSecureStringParameterAttributes since the existing parameter is SecureString type
        this.fredApiKeyParameter = ssm.StringParameter.fromSecureStringParameterAttributes(
            this,
            'FredApiKeyParameter',
            {
                parameterName: parameterName,
                version: 1, // Use version 1 or latest
            }
        );

        // Create Lambda function with NodejsFunction construct
        // This automatically bundles TypeScript code and dependencies
        this.lambdaFunction = new nodejs.NodejsFunction(this, 'MacroIngestionFunction', {
            // Function name for easy identification
            functionName: `${environment}-magikarp-macro-ingestion`,

            // Entry point for the Lambda function
            entry: path.join(__dirname, '../../lambda/macro-data-ingestion/index.ts'),

            // Handler function name (exported from index.ts)
            handler: 'handler',

            // Runtime environment
            runtime: lambda.Runtime.NODEJS_20_X,

            // Architecture
            architecture: lambda.Architecture.ARM_64,

            // Timeout: 10 minutes for backfill operations (Requirement 9.3)
            timeout: cdk.Duration.minutes(10),

            // Memory allocation (512 MB should be sufficient for API calls and data processing)
            memorySize: 512,

            // Environment variables (Requirement 9.1, 9.2, 9.3, 9.4, 9.5)
            environment: {
                // DynamoDB table name
                MACRO_INDICATORS_TABLE: props.macroIndicatorsTable.tableName,

                // Environment name (dev, staging, prod)
                ENVIRONMENT: environment,

                // SSM Parameter name for FRED API key
                FRED_API_KEY_PARAMETER: this.fredApiKeyParameter.parameterName,

                // Node options for better performance
                NODE_OPTIONS: '--enable-source-maps',
            },

            // Bundling configuration
            bundling: {
                // External modules that should not be bundled (AWS SDK is provided by Lambda runtime)
                externalModules: [
                    '@aws-sdk/client-dynamodb',
                    '@aws-sdk/client-secrets-manager',
                    '@aws-sdk/client-ssm',
                    '@aws-sdk/util-dynamodb',
                ],

                // Minify code for smaller bundle size
                minify: true,

                // Source maps for better error debugging
                sourceMap: true,

                // Target ES2020 for Node.js 20
                target: 'es2020',

                // Keep names for better stack traces
                keepNames: true,

                // Force local bundling to avoid Docker requirement
                forceDockerBundling: false,
            },

            // Retry configuration
            retryAttempts: 0, // Disable automatic retries (we handle retries in code)

            // Description
            description: 'Ingests macroeconomic data from FRED and Yahoo Finance into DynamoDB',
        });

        // Grant DynamoDB write permissions to Lambda role (Requirement 9.4)
        props.macroIndicatorsTable.grantWriteData(this.lambdaFunction);

        // Grant Lambda function permission to read SSM Parameter (Requirement 9.1, 9.2, 9.5)
        this.fredApiKeyParameter.grantRead(this.lambdaFunction);

        // Grant permission to read all 5 API key parameters for parallel backfill
        for (let i = 1; i <= 5; i++) {
            const paramName = `/magikarp/${environment}/fred-api-key-${i}`;
            const param = ssm.StringParameter.fromSecureStringParameterAttributes(
                this,
                `FredApiKeyParameter${i}`,
                { parameterName: paramName, version: 1 }
            );
            param.grantRead(this.lambdaFunction);
        }

        // If API keys secret is provided, grant read permissions (legacy support)
        if (props.apiKeysSecret) {
            props.apiKeysSecret.grantRead(this.lambdaFunction);

            // Add secret ARN to environment variables
            this.lambdaFunction.addEnvironment(
                'API_KEYS_SECRET_ARN',
                props.apiKeysSecret.secretArn
            );
        }

        // Apply tags to Lambda function
        cdk.Tags.of(this.lambdaFunction).add('Project', 'Magikarp');
        cdk.Tags.of(this.lambdaFunction).add('Environment', environment);
        cdk.Tags.of(this.lambdaFunction).add('ManagedBy', 'CDK');
        cdk.Tags.of(this.lambdaFunction).add('Component', 'MacroDataIngestion');

        // Output Lambda function ARN for reference
        new cdk.CfnOutput(this, 'MacroIngestionFunctionArn', {
            value: this.lambdaFunction.functionArn,
            description: 'ARN of the macro data ingestion Lambda function',
            exportName: `${environment}-MacroIngestionFunctionArn`,
        });

        // Output Lambda function name for reference
        new cdk.CfnOutput(this, 'MacroIngestionFunctionName', {
            value: this.lambdaFunction.functionName,
            description: 'Name of the macro data ingestion Lambda function',
            exportName: `${environment}-MacroIngestionFunctionName`,
        });

        // Output SSM Parameter name for reference (Requirement 9.1, 9.2, 9.5)
        new cdk.CfnOutput(this, 'FredApiKeyParameterName', {
            value: this.fredApiKeyParameter.parameterName,
            description: 'SSM Parameter name for FRED API key',
            exportName: `${environment}-FredApiKeyParameterName`,
        });

        // Create EventBridge rule for daily scheduled execution (Requirement 7.1, 7.2)
        // Schedule: 11 PM UTC (6 PM EST after market close)
        this.dailyScheduleRule = new events.Rule(this, 'DailyScheduleRule', {
            // Rule name for easy identification
            ruleName: `${environment}-magikarp-macro-ingestion-daily`,

            // Description
            description: 'Triggers macro data ingestion Lambda daily at 11 PM UTC (6 PM EST)',

            // Cron schedule: 11 PM UTC every weekday
            // Format: minute hour day-of-month month day-of-week year
            schedule: events.Schedule.cron({
                minute: '0',
                hour: '23',  // 11 PM UTC = 6 PM EST (after market close)
                month: '*',  // Every month
                weekDay: '1-5',
                year: '*',   // Every year
            }),

            // Enable the rule by default
            enabled: true,
        });

        // Add Lambda function as target for the EventBridge rule
        // Pass empty event to trigger daily fetch (default behavior)
        this.dailyScheduleRule.addTarget(new targets.LambdaFunction(this.lambdaFunction, {
            // Empty event triggers daily fetch for current date
            event: events.RuleTargetInput.fromObject({}),

            // Retry configuration for failed invocations
            retryAttempts: 2,

            // Maximum event age (24 hours)
            maxEventAge: cdk.Duration.hours(24),
        }));

        // Apply tags to EventBridge rule
        cdk.Tags.of(this.dailyScheduleRule).add('Project', 'Magikarp');
        cdk.Tags.of(this.dailyScheduleRule).add('Environment', environment);
        cdk.Tags.of(this.dailyScheduleRule).add('ManagedBy', 'CDK');
        cdk.Tags.of(this.dailyScheduleRule).add('Component', 'MacroDataIngestion');

        // Output EventBridge rule ARN for reference
        new cdk.CfnOutput(this, 'DailyScheduleRuleArn', {
            value: this.dailyScheduleRule.ruleArn,
            description: 'ARN of the daily schedule EventBridge rule',
            exportName: `${environment}-MacroIngestionDailyScheduleRuleArn`,
        });

        // Output EventBridge rule name for reference
        new cdk.CfnOutput(this, 'DailyScheduleRuleName', {
            value: this.dailyScheduleRule.ruleName,
            description: 'Name of the daily schedule EventBridge rule',
            exportName: `${environment}-MacroIngestionDailyScheduleRuleName`,
        });
    }
}
