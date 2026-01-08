/**
 * AWS Secrets Manager and SSM Parameter Store helper for retrieving API keys
 * 
 * Supports both Secrets Manager (legacy) and SSM Parameter Store (preferred)
 * with caching to avoid repeated API calls
 * 
 * Requirements: 9.1, 9.2, 9.5
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-west-2' });
const ssmClient = new SSMClient({ region: process.env.AWS_REGION || 'us-west-2' });

// Cache secrets and parameters to avoid repeated API calls (Requirement 9.5)
const secretCache: Record<string, string> = {};
const parameterCache: Record<string, string> = {};

/**
 * Retrieve a secret from AWS Secrets Manager with caching
 * @param secretName The name/ARN of the secret
 * @returns The secret value as a string
 */
export async function getSecret(secretName: string): Promise<string> {
    // Return cached value if available
    if (secretCache[secretName]) {
        console.log(`Using cached secret for ${secretName}`);
        return secretCache[secretName];
    }

    try {
        console.log(`Fetching secret from Secrets Manager: ${secretName}`);
        const command = new GetSecretValueCommand({ SecretId: secretName });
        const response = await secretsClient.send(command);

        if (!response.SecretString) {
            throw new Error(`Secret ${secretName} has no string value`);
        }

        // Cache the secret
        secretCache[secretName] = response.SecretString;
        return response.SecretString;

    } catch (error) {
        console.error(`Failed to retrieve secret ${secretName}:`, error);
        throw error;
    }
}

/**
 * Retrieve a parameter from AWS Systems Manager Parameter Store with caching
 * Requirements: 9.1, 9.2, 9.5
 * 
 * @param parameterName The name of the SSM parameter
 * @param withDecryption Whether to decrypt SecureString parameters (default: true)
 * @returns The parameter value as a string
 */
export async function getParameter(parameterName: string, withDecryption: boolean = true): Promise<string> {
    // Return cached value if available (Requirement 9.5)
    if (parameterCache[parameterName]) {
        console.log(`Using cached parameter for ${parameterName}`);
        return parameterCache[parameterName];
    }

    try {
        console.log(`Fetching parameter from SSM Parameter Store: ${parameterName}`);
        const command = new GetParameterCommand({
            Name: parameterName,
            WithDecryption: withDecryption  // Decrypt SecureString parameters
        });
        const response = await ssmClient.send(command);

        if (!response.Parameter?.Value) {
            throw new Error(`Parameter ${parameterName} has no value`);
        }

        // Cache the parameter (Requirement 9.5)
        parameterCache[parameterName] = response.Parameter.Value;
        return response.Parameter.Value;

    } catch (error) {
        console.error(`Failed to retrieve parameter ${parameterName}:`, error);
        throw error;
    }
}

/**
 * Get FRED API key from SSM Parameter Store or Secrets Manager
 * Tries SSM Parameter Store first (preferred), falls back to Secrets Manager
 * Requirements: 9.1, 9.2
 */
export async function getFredApiKey(): Promise<string> {
    // Try SSM Parameter Store first (preferred method)
    const parameterName = process.env.FRED_API_KEY_PARAMETER;
    if (parameterName) {
        try {
            console.log(`Fetching FRED API key from SSM Parameter Store: ${parameterName}`);
            return await getParameter(parameterName);
        } catch (error) {
            console.error(`Failed to retrieve FRED API key from SSM Parameter Store:`, error);
            throw error;
        }
    }

    // Fall back to Secrets Manager (legacy support)
    const secretName = process.env.FRED_SECRET_NAME || 'magikarp/macro-data/fred-api-key';
    console.log(`Falling back to Secrets Manager for FRED API key: ${secretName}`);
    return getSecret(secretName);
}

/**
 * Get Alpha Vantage API key from Secrets Manager
 * (Alpha Vantage is not currently used, but kept for potential future use)
 */
export async function getAlphaVantageApiKey(): Promise<string> {
    const secretName = process.env.ALPHA_VANTAGE_SECRET_NAME || 'magikarp/macro-data/alpha-vantage-api-key';
    return getSecret(secretName);
}
