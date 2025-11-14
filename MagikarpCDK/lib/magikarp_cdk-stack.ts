import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DatabaseConstruct } from './constructs/database-construct';

export class MagikarpCdkStack extends cdk.Stack {
  /**
   * Database construct containing all DynamoDB tables
   * Exposed for future reference by other constructs
   */
  public readonly database: DatabaseConstruct;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Get environment from stack context (defaults to 'dev' if not provided)
    const environment = this.node.tryGetContext('environment') || 'dev';

    // Instantiate DatabaseConstruct with environment configuration
    this.database = new DatabaseConstruct(this, 'Database', {
      environment: environment
    });
  }
}
