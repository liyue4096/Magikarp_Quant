/**
 * AWS Secrets Manager helper for retrieving API keys
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-west-2' });

// Cache secrets to avoid repeated API calls
const secretCache: Record<string, string> = {};

/**
 * Retrieve a secret from AWS Secrets Manager with caching
 * @param secretName The name/ARN of the secret
 * @returns The secret value as a string
 */
export async function getSecret(secretName: string): Promise<string> {
    // Return cached value if available
    if (secretCache[secretName]) {
        return secretCache[secretName];
    }

    try {
        const command = new GetSecretValueCommand({ SecretId: secretName });
        const response = await client.send(command);

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
 * Get FRED API key from Secrets Manager
 */
export async function getFredApiKey(): Promise<string> {
    const secretName = process.env.FRED_SECRET_NAME || 'magikarp/macro-data/fred-api-key';
    return getSecret(secretName);
}

/**
 * Get Alpha Vantage API key from Secrets Manager
 */
export async function getAlphaVantageApiKey(): Promise<string> {
    const secretName = process.env.ALPHA_VANTAGE_SECRET_NAME || 'magikarp/macro-data/alpha-vantage-api-key';
    return getSecret(secretName);
}
