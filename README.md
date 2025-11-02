# Magikarp Trading System

> AI-powered trading recommendation system using reinforcement learning for Russell 3000 stocks

## Overview

Magikarp is a serverless AWS-based trading system that combines technical analysis with fundamental data to generate daily stock recommendations using FinRL reinforcement learning. The system processes 3,000+ stocks daily, learns from market patterns, and provides actionable BUY/SELL/HOLD signals.

## Key Features

- **Daily Recommendations**: Automated trading signals after market close (6 PM UTC)
- **Hybrid Intelligence**: Combines 15 technical indicators + 10 fundamental metrics
- **Reinforcement Learning**: PPO/A2C/SAC algorithms trained monthly on latest market data
- **Model Validation**: 2-month backtesting + 7-day shadow mode before deployment
- **Smart Rollback**: Keeps last 20 model versions for safety
- **Performance Tracking**: Benchmarked against QQQ with Sharpe ratio, Alpha, and Beta
- **Cost-Effective**: ~$54/month using free Yahoo Finance data

## Architecture

```
Market Data (Yahoo Finance) → Lambda (TypeScript) → S3 Storage
                                                        ↓
Email Notifications ← Lambda (Python) ← SageMaker (FinRL Training)
                           ↓
                    React Dashboard (Amplify)
```

## Tech Stack

- **Infrastructure**: AWS CDK (TypeScript)
- **Backend**: Lambda (TypeScript + Python)
- **ML Framework**: FinRL + Stable-Baselines3
- **Frontend**: React + TypeScript
- **Storage**: S3 + DynamoDB
- **Training**: SageMaker (ml.m5.2xlarge)

## Model Specifications

- **Universe**: 3,600 stocks (3,000 active + 300 archive + 300 padding)
- **Features**: 32 per stock (15 technical + 10 fundamental + 2 temporal + 5 padding)
- **Observation Space**: 115,200 dimensions
- **Model Size**: ~900 MB
- **Training**: Monthly (6-8 hours)
- **Inference**: Daily (3-5 minutes)

## Feature Set

### Technical Indicators (15)
OHLCV, RSI, MACD, Bollinger Bands, volume, volatility, momentum

### Fundamental Metrics (10)
P/E ratio, P/B ratio, EPS, revenue growth, debt-to-equity, ROE, profit margin, market cap, beta, dividend yield

### Temporal Features (2)
New stock indicator, index tenure tracking

### Padding (5)
Reserved for future expansion (news sentiment, analyst ratings, etc.)

## Daily Workflow

1. **18:00 UTC** - Fetch market data + fundamentals
2. **18:20 UTC** - Feature engineering (32 features per stock)
3. **18:30 UTC** - Model inference (generate recommendations)
4. **18:45 UTC** - Email top 20-30 BUY and 10-15 SELL signals

## Monthly Workflow

1. **Day 1** - Train new model on latest 30 days
2. **Day 1** - Backtest on 2-month window
3. **Day 1-7** - Shadow mode (parallel validation)
4. **Day 8** - Promote to production if metrics pass
5. **Ongoing** - Keep last 20 versions for rollback

## Performance Metrics

- Sharpe Ratio vs QQQ baseline
- Alpha (excess returns)
- Beta (market correlation)
- Maximum drawdown
- 12-month success rate

## Cost Breakdown

| Service | Monthly Cost |
|---------|--------------|
| Market Data (Yahoo Finance) | $0 |
| Lambda + ECR | $18 |
| S3 Storage | $7 |
| SageMaker Training | $3.77 |
| DynamoDB | $10 |
| Other (SES, Amplify, etc.) | $15 |
| **Total** | **~$54** |

## Project Structure

```
magikarp/
├── MagikarpCDK/           # Infrastructure as Code
├── lambda/
│   ├── data-fetch/        # TypeScript - Market data ingestion
│   ├── inference/         # Python - Daily recommendations
│   └── api/               # TypeScript - REST endpoints
├── sagemaker/             # FinRL training scripts
├── frontend/              # React dashboard
└── doc/                   # Design documents
```

## Development Milestones

### Milestone 1 (MVP - 4 weeks)
- Data ingestion (price + fundamentals)
- Feature engineering (32 features)
- Basic FinRL environment
- Daily recommendations
- Email notifications
- Simple dashboard

### Milestone 2 (Enhanced - 6 weeks)
- Advanced RL algorithms (PPO, A2C, SAC)
- Model validation pipeline
- Performance tracking
- Model versioning + rollback
- Historical analysis

### Milestone 3 (Production - 8 weeks)
- Multi-environment deployment
- Risk management
- Performance optimization
- Comprehensive monitoring

## Getting Started

```bash
# Install dependencies
npm install

# Deploy infrastructure
cd MagikarpCDK
npm run deploy

# Configure data sources
# Edit .env with API keys (optional - Yahoo Finance is free)

# Start local development
npm run dev
```

## Documentation

- [High-Level Design](doc/High_Level_design_v2.md) - Complete system architecture
- [Architecture Decisions](doc/ARCHITECTURE_DECISIONS.md) - Key design choices

## Disclaimer

This system is for educational and research purposes only. Always consult with financial advisors before making investment decisions. Past performance does not guarantee future results.

## License

MIT

---

**Built with ❤️ using FinRL and AWS**
