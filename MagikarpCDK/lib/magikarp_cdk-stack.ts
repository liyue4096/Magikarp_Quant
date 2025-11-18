import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DatabaseConstruct } from './constructs/database-construct';
import { MacroIngestionConstruct } from './constructs/macro-ingestion-construct';

export class MagikarpCdkStack extends cdk.Stack {
  /**
   * Database construct containing all DynamoDB tables
   * Exposed for future reference by other constructs
   */
  public readonly database: DatabaseConstruct;

  /**
   * Macro data ingestion construct containing Lambda function and EventBridge schedule
   * Exposed for future reference and manual invocation
   */
  public readonly macroIngestion: MacroIngestionConstruct;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Get environment from stack context (defaults to 'dev' if not provided)
    const environment = this.node.tryGetContext('environment') || 'dev';

    // Instantiate DatabaseConstruct with environment configuration
    this.database = new DatabaseConstruct(this, 'Database', {
      environment: environment
    });

    // Instantiate MacroIngestionConstruct with database table reference
    // Requirements: 7.1, 7.2, 9.2
    this.macroIngestion = new MacroIngestionConstruct(this, 'MacroIngestion', {
      macroIndicatorsTable: this.database.macroIndicatorsTable,
      environment: environment
    });
  }
}
