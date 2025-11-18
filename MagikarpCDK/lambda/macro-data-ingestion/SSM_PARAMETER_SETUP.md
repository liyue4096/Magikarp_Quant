# SSM Parameter Store Setup Guide

This guide explains how to set up and manage the FRED API key using AWS Systems Manager Parameter Store.

## Overview

The macro data ingestion Lambda function uses SSM Parameter Store to securely store and retrieve the FRED API key. This approach provides:

- **Security**: API keys are encrypted using AWS KMS
- **Caching**: Keys are cached in memory to avoid repeated SSM API calls
- **Easy Rotation**: Update keys without redeploying the Lambda function
- **Audit Trail**: AWS CloudTrail logs all parameter access

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Lambda Function                          │
│                                                             │
│  1. On first invocation:                                   │
│     - Fetch FRED API key from SSM Parameter Store          │
│     - Cache the key in memory                              │
│     - Initialize FRED API client                           │
│                                                             │
│  2. On subsequent invocations:                             │
│     - Use cached API key (no SSM call)                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │  SSM Parameter Store  │
                │  (SecureString/KMS)   │
                │                       │
                │  /magikarp/dev/       │
                │    fred-api-key       │
                └───────────────────────┘
```

## Deployment Steps

### 1. Deploy the CDK Stack

The CDK stack automatically creates the SSM Parameter with a placeholder value:

```bash
cd MagikarpCDK
cdk deploy --context environment=dev
```

This creates:
- SSM Parameter: `/magikarp/dev/fred-api-key`
- Lambda function with read permissions to the parameter
- Environment variable: `FRED_API_KEY_PARAMETER` pointing to the parameter name

### 2. Update the Parameter with Your API Key

After deployment, update the parameter with your actual FRED API key:

```bash
# Get your FRED API key from: https://fred.stlouisfed.org/docs/api/api_key.html

# Update the parameter
aws ssm put-parameter \
  --name "/magikarp/dev/fred-api-key" \
  --value "YOUR_ACTUAL_FRED_API_KEY" \
  --type "SecureString" \
  --overwrite \
  --region us-west-2
```

### 3. Verify the Parameter

```bash
# Verify the parameter exists
aws ssm get-parameter \
  --name "/magikarp/dev/fred-api-key" \
  --with-decryption \
  --region us-west-2
```

### 4. Test the Lambda Function

Invoke the Lambda function to verify it can read the parameter:

```bash
aws lambda invoke \
  --function-name dev-magikarp-macro-ingestion \
  --payload '{"date":"2024-01-15"}' \
  --region us-west-2 \
  response.json

# Check the response
cat response.json
```

## Parameter Management

### Rotating the API Key

To rotate the FRED API key:

1. Get a new API key from FRED
2. Update the SSM Parameter:
   ```bash
   aws ssm put-parameter \
     --name "/magikarp/dev/fred-api-key" \
     --value "NEW_FRED_API_KEY" \
     --type "SecureString" \
     --overwrite
   ```
3. The Lambda function will use the new key on the next cold start
4. To force immediate update, you can update the Lambda environment variable to trigger a restart

### Viewing Parameter History

```bash
aws ssm get-parameter-history \
  --name "/magikarp/dev/fred-api-key" \
  --region us-west-2
```

### Deleting the Parameter

```bash
aws ssm delete-parameter \
  --name "/magikarp/dev/fred-api-key" \
  --region us-west-2
```

## Multi-Environment Setup

For multiple environments (dev, staging, prod), each environment has its own parameter:

```bash
# Dev environment
aws ssm put-parameter \
  --name "/magikarp/dev/fred-api-key" \
  --value "DEV_FRED_API_KEY" \
  --type "SecureString" \
  --overwrite

# Staging environment
aws ssm put-parameter \
  --name "/magikarp/staging/fred-api-key" \
  --value "STAGING_FRED_API_KEY" \
  --type "SecureString" \
  --overwrite

# Production environment
aws ssm put-parameter \
  --name "/magikarp/prod/fred-api-key" \
  --value "PROD_FRED_API_KEY" \
  --type "SecureString" \
  --overwrite
```

## Troubleshooting

### Lambda Cannot Read Parameter

**Error**: `AccessDeniedException: User is not authorized to perform: ssm:GetParameter`

**Solution**: Verify the Lambda execution role has the correct permissions:

```bash
# Check the Lambda role
aws lambda get-function \
  --function-name dev-magikarp-macro-ingestion \
  --query 'Configuration.Role'

# The CDK stack should have granted ssm:GetParameter permission
# If not, you may need to redeploy the stack
```

### Parameter Not Found

**Error**: `ParameterNotFound: Parameter /magikarp/dev/fred-api-key not found`

**Solution**: Create the parameter:

```bash
aws ssm put-parameter \
  --name "/magikarp/dev/fred-api-key" \
  --value "YOUR_FRED_API_KEY" \
  --type "SecureString"
```

### Cached Value Not Updating

The Lambda function caches the API key in memory for the lifetime of the Lambda container. To force a refresh:

1. Update the Lambda environment variable (any variable) to trigger a restart
2. Or wait for the Lambda container to be recycled (typically after 15-30 minutes of inactivity)

## Security Best Practices

1. **Use SecureString Type**: Always use `SecureString` type for sensitive parameters
2. **Limit Access**: Only grant `ssm:GetParameter` permission to the Lambda execution role
3. **Enable CloudTrail**: Monitor parameter access via CloudTrail logs
4. **Rotate Keys Regularly**: Rotate API keys every 90 days
5. **Use Different Keys per Environment**: Never share API keys between dev/staging/prod

## Cost Considerations

- **SSM Parameter Store**: Free for Standard parameters (up to 10,000 parameters)
- **KMS Encryption**: $1/month per key + $0.03 per 10,000 API calls
- **Lambda Caching**: Reduces SSM API calls to ~1 per Lambda cold start

## References

- [AWS Systems Manager Parameter Store Documentation](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html)
- [FRED API Documentation](https://fred.stlouisfed.org/docs/api/fred/)
- [AWS Lambda Environment Variables](https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars.html)
