# Magikarp Trading System

AI-powered trading recommendation system using reinforcement learning for Russell 1000 stocks. Generates daily BUY/SELL/HOLD signals by combining technical analysis with fundamental data.

## What It Does

- Analyzes 1,000 large-cap stocks daily using 15 technical indicators + 10 fundamental metrics
- Trains RL models monthly on 6 months of historical data
- Delivers automated trading signals via email after market close
- Costs ~$31/month using AWS serverless architecture

## Quick Start

### Prerequisites

- AWS Account with CLI configured
- Node.js 18+ and Python 3.9+
- AWS CDK 2.x: `npm install -g aws-cdk`

### Setup

```bash
# 1. Bootstrap CDK (first time only)
cdk bootstrap aws://ACCOUNT-ID/REGION

# 2. Install dependencies
cd MagikarpCDK && npm install
cd ../Magikarp && pip install -r requirements.txt

# 3. Deploy infrastructure
cd MagikarpCDK
cdk deploy --all

# 4. Verify deployment
aws lambda list-functions --query 'Functions[?starts_with(FunctionName, `Magikarp`)].FunctionName'
```

### Configuration

Set up AWS credentials:
```bash
aws configure
# Enter Access Key ID, Secret Access Key, and region (e.g., us-east-1)
```

## Architecture

```
Yahoo Finance → Lambda (Data Ingestion) → S3 + DynamoDB
                                              ↓
Email Alerts ← Lambda (Inference) ← SageMaker (RL Training)
```

Tech Stack: AWS CDK, Lambda (TypeScript/Python), FinRL, SageMaker, React

## Project Structure

```
MagikarpCDK/          # Infrastructure & Lambda functions
Magikarp/             # ML training code
doc/                  # Design documentation
```

## Documentation

- [High-Level Design](doc/High_Level_design_v2.md) - System architecture
- [Architecture Decisions](doc/ARCHITECTURE_DECISIONS.md) - Design rationale

## Disclaimer

Educational purposes only. Not financial advice. Consult professionals before investing.

## License

MIT
