# TMagikarp - Stock Recommendation System HLD v2.0

## Overview

A serverless AWS-based trading recommendation system that fetches daily stock market data for Russell 1000 stocks (~1,000 large-cap stocks representing 92% of US market capitalization), uses FinRL reinforcement learning to generate daily trading recommendations, and provides real-time monitoring through a web dashboard. The system operates with daily data collection, daily recommendation generation, and monthly model retraining. The architecture is designed to scale to Russell 3000 in future phases.

## Goals

### Primary Goals

1. **Automated Daily Recommendations**: Generate BUY/SELL/HOLD signals for Russell 1000 stocks every trading day using reinforcement learning
2. **Cost-Effective Operation**: Maintain monthly operational costs under $50 using serverless architecture and free data sources
3. **Scalable ML Pipeline**: Support 1,000+ stocks with 32 features per stock, processing within 15 minutes daily
4. **Model Safety**: Implement multi-gate validation (6-month backtesting + 7-day shadow mode) to prevent bad model deployments
5. **Educational Platform**: Provide transparent, reproducible system for learning algorithmic trading and RL applications

### Secondary Goals

1. **Performance Tracking**: Monitor and report trading performance metrics (Sharpe ratio, drawdown, win rate) against QQQ baseline
2. **System Reliability**: Achieve 99.9% uptime with automated error handling and fallback mechanisms
3. **Real-Time Monitoring**: Provide web dashboard for system health, recommendations, and portfolio state
4. **Flexible Universe**: Support Russell 1000 annual rebalancing without model retraining using fixed-slot architecture, with clear path to expand to Russell 3000
4. **Flexible Universe**: Support Russell 3000 annual rebalancing without model retraining using fixed-slot architecture

## Non-Goals

### Explicitly Out of Scope

1. **Real Trading Execution**: System generates recommendations only; does not execute actual trades or integrate with brokerages
2. **Intraday Trading**: Focus on end-of-day signals only; no real-time tick data or high-frequency trading
3. **Options/Derivatives**: Limited to equity stocks; no options, futures, forex, or crypto trading
4. **Portfolio Construction Constraints**: No sector limits, concentration limits, turnover constraints, or tax-loss harvesting
5. **Alternative Data**: No sentiment analysis, news feeds, social media, or satellite imagery (padding features reserved for future)
6. **Multi-Asset Classes**: Russell 1000 US large-cap equities only; no mid/small-caps, international stocks, bonds, or commodities (initially)
7. **Backtesting Framework**: No comprehensive historical simulation tool (only validation backtesting for new models)
8. **User Management**: Single-user system; no multi-tenant support, authentication, or user accounts
9. **Mobile App**: Web dashboard only; no native iOS/Android applications
10. **Real-Time Alerts**: Email notifications only; no SMS, push notifications, or real-time price alerts

### Future Considerations (Not in Initial Scope)

- **Expansion to Russell 3000**: Add mid-cap and small-cap stocks (Russell 2000/3000)
- Integration with brokerage APIs for automated execution
- Advanced position sizing techniques (Kelly Criterion, volatility-based sizing, risk-adjusted sizing)
- Risk parity and equal risk contribution strategies
- Sentiment analysis from news and social media (using padding features)
- International stock markets (FTSE, DAX, Nikkei)
- Multi-model ensemble approaches
- Real-time streaming data processing

## System Architecture

```
┌─────────────────┐    ┌──────────────┐     ┌─────────────────┐
│   3rd Party     │    │   Lambda     │     │      S3         │
│   Market API    │───▶│  Data Fetch  │───▶│  Raw Data       │
│  (Alpha Vantage,│    │   Function   │     │   Storage       │
│   Yahoo, etc.)  │    └──────────────┘     └─────────────────┘
└─────────────────┘                                │
                                                   │
┌─────────────────┐    ┌──────────────┐            │
│     Email       │◀───│   Lambda     │◀──────────┘
│  Notification   │    │ FinRL Signal │
│   (SES/SNS)     │    │  Generator   │
└─────────────────┘    └──────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │   SageMaker     │
                       │  FinRL Model    │
                       │  (Training &    │
                       │   Inference)    │
                       └─────────────────┘
                              │
                              ▼
┌─────────────────┐    ┌──────────────┐
│  AWS Amplify    │    │  API Gateway │
│   Frontend      │◀───│   + Lambda   │
│   Dashboard     │    │   Backend    │
└─────────────────┘    └──────────────┘
          │                     │
          ▼                     ▼
┌─────────────────┐    ┌──────────────┐
│   CloudWatch    │    │  DynamoDB    │
│   Logs/Metrics  │    │  Dashboard   │
│                 │    │    Data      │
└─────────────────┘    └──────────────┘
```

## Core Components

### 1. Data Ingestion Layer

- **Purpose**: Fetch daily market data and quarterly fundamentals for Russell 1000 stocks
- **Technology**: AWS Lambda (TypeScript) with parallel processing
- **Trigger**: CloudWatch Events (daily at 22:00 UTC, ~1 hour after market close)
- **Data Sources**: Yahoo Finance (primary), with backup sources (Polygon.io, Alpha Vantage)
- **Output**: Raw OHLCV data and quarterly fundamentals stored in S3
- **Volume**: ~1,000 stocks × 365 days × ~2KB = ~730 MB/year

### 2. Data Storage Layer

- **S3**: Raw market data, quarterly fundamentals, trained models (~300-400 MB), processed features
- **DynamoDB**: System metrics, daily trading signals, portfolio state, stock universe metadata

### 3. ML Processing Layer (FinRL)

- **Framework**: FinRL reinforcement learning with StockTradingEnv
- **Universe**: Fixed 1,200-slot architecture (1,000 active + 100 archive + 100 padding) handles Russell 1000 rebalancing without retraining
- **Features**: 32 per stock (15 technical + 10 fundamental + 2 temporal + 5 padding)
- **Model Scale**: 38,400-dim observation space (1,200 × 32), 1,200-dim action space, ~300-400 MB model size
- **Algorithms**: PPO, A2C, SAC
- **Training**: Monthly on SageMaker (ml.m5.xlarge, ~2-3 hours) using last 6 months of data
- **Validation**: 6-month backtesting (out-of-sample) + 7-day shadow mode before production deployment
- **Output**: Daily portfolio target weights converted to BUY/SELL/HOLD recommendations

### 4. Recommendation Generation Layer

- **Technology**: Lambda Container Image (~800 MB, 4 GB memory, 5-min timeout)
- **Trigger**: Daily at 22:30 UTC (30 minutes after data ingestion)
- **Process**: Load model → fetch features → predict weights → generate BUY/SELL/HOLD signals → update portfolio state → send email
- **Processing Time**: ~1-2 minutes for 1,200 stocks
- **Output**: Daily recommendations with target weights and confidence scores

### 5. Notification Layer

- **Service**: Amazon SES for email notifications
- **Types**: Critical alerts (system failures), warnings (data quality issues), info (daily recommendations, monthly performance)
- **Format**: HTML emails with charts and summaries

### 6. Frontend Dashboard

- **Technology**: React + TypeScript hosted on AWS Amplify
- **Features**: System health monitoring, recommendation history, portfolio state, performance metrics, interactive charts, model performance tracking

## Data Flow

The system operates on two main cycles:

- **Daily**: Data ingestion (22:00 UTC) → Feature engineering → Recommendation generation (22:30 UTC) → Email notifications
- **Monthly**: Model retraining → Validation (backtesting + shadow mode) → Production deployment

See Low-Level Design document for detailed workflows and timing.

## Technology Stack

| Layer          | Technology                | Purpose                |
| -------------- | ------------------------- | ---------------------- |
| Infrastructure | AWS CDK (TypeScript)      | Infrastructure as Code |
| Backend        | Lambda (Python 3.9 ML, TypeScript APIs) | Serverless compute |
| ML Framework   | FinRL + Stable-Baselines3 | Reinforcement Learning |
| Frontend       | React + TypeScript        | Dashboard UI           |
| Database       | DynamoDB + S3             | Data storage           |
| API            | API Gateway + Lambda (TypeScript) | REST endpoints |
| Hosting        | AWS Amplify               | Frontend deployment    |
| Training       | SageMaker                 | ML model training      |
| Monitoring     | CloudWatch                | System monitoring      |

## Key Metrics & KPIs

### Trading Performance

- **12-Month Success Rate**: Percentage of profitable monthly signals
- **Annualized Sharpe Ratio**: Risk-adjusted returns vs QQQ baseline
- **Beta vs QQQ**: Market correlation and systematic risk
- **Alpha vs QQQ**: Excess returns above market benchmark
- **Maximum Drawdown**: Worst peak-to-trough decline
- **Portfolio Value**: Monthly tracking
- **Signal Confidence**: FinRL action values

### System Performance

- **Data Fetch Success Rate**: API reliability (99.5% target)
- **Signal Generation Latency**: Monthly processing time (<5 minutes)
- **Email Delivery Rate**: Notification success (99% target)
- **System Uptime**: Overall availability (99.9% target)

## Security & Compliance

### Data Protection

- **Encryption**: S3 server-side encryption (SSE-S3)
- **API Keys**: AWS Secrets Manager with automatic rotation
- **Access Control**: IAM roles with least privilege
- **Network**: VPC with private subnets

### Monitoring & Alerts

- **CloudWatch**: Logs, metrics, and alarms
- **Cost Monitoring**: Budget alerts and usage tracking
- **Performance**: Lambda execution metrics
- **Security**: AWS Config compliance rules

## Cost Estimation (Monthly)

| Service     | Usage                                  | Estimated Cost |
| ----------- | -------------------------------------- | -------------- |
| Market Data | Russell 1000 daily + fundamentals (Yahoo Finance) | $0 |
| Lambda/ECR  | ~22 daily + 1 monthly + container storage | $10         |
| S3          | 20GB storage + API calls               | $3             |
| SageMaker   | 3hrs/month (ml.m5.xlarge @ $0.269/hr) | $0.81/month    |
| DynamoDB    | 5GB storage, moderate R/W (daily updates) | $5            |
| SES         | ~22 daily + 1 monthly emails           | $1             |
| Amplify     | Hosting + builds                       | $5             |
| API Gateway | 10K requests/month                     | $1             |
| CloudWatch  | Logs and metrics                       | $5             |
| **Total**   |                                        | **~$31/month** |

**Cost Notes:**

- **Market Data**: Free with Yahoo Finance (yfinance library) for daily OHLCV + quarterly fundamentals
- **Training**: 3 hours × $0.269/hour = $0.81/month (1,200-slot universe, 32 features, monthly retraining)
- **Inference**: Lambda Container (4GB, 2min) × 22 trading days = ~$2.50/month for daily recommendations
- **Storage**: ~20GB for 1,000 stocks × 365 days × 3 years (price + fundamentals)
- **DynamoDB**: Moderate usage for daily portfolio state updates and recommendation storage
- **Scalability**: Costs will increase to ~$54/month when expanding to Russell 3000

## Risk Management

### Technical Risks

- **API Rate Limits**: Multiple data sources and exponential backoff
- **Model Performance**: 
  - 2-month backtesting before deployment
  - 7-day shadow mode validation
  - Automated rollback on performance degradation
  - Manual approval gate for production promotion
- **System Failures**: Automated alerts and rollback procedures
- **Data Quality**: Validation checks with email notifications
- **Bad Model Deployment**: Multi-gate validation prevents catastrophic decisions

### Financial Risks

- **Model Accuracy**: 12-month performance tracking with manual override
- **Market Volatility**: Monthly rebalancing reduces exposure
- **Regulatory**: Compliance with financial regulations

## Success Criteria

### Milestone 1 (MVP - 4 weeks) - Russell 1000

- [ ] Automated daily data ingestion for Russell 1000 (price + fundamentals) with error handling
- [ ] Quarterly fundamentals fetching and caching from Yahoo Finance
- [ ] Feature engineering pipeline (15 technical + 10 fundamental + 2 temporal + 5 padding features)
- [ ] FinRL StockTradingEnv setup with 1,200-slot universe (1,000 active + 100 archive + 100 padding)
- [ ] Portfolio state tracking in DynamoDB
- [ ] Daily recommendation generation (BUY/SELL/HOLD logic)
- [ ] Email notifications with daily recommendations
- [ ] Simple dashboard with system status and current portfolio

### Milestone 2 (Enhanced - 6 weeks) - Production Ready

- [ ] Advanced FinRL algorithms (PPO, A2C, SAC)
- [ ] Enhanced model validation pipeline (6-month backtesting + 7-day shadow mode)
- [ ] Comprehensive dashboard with daily performance metrics
- [ ] Recommendation success rate tracking (30-day, 90-day)
- [ ] Automated monthly model retraining with validation gates
- [ ] Model versioning and rollback capability (last 20 versions)
- [ ] Historical recommendation analysis
- [ ] Russell 1000 annual rebalancing handling

### Milestone 3 (Scale to Russell 3000 - 10 weeks)

- [ ] Expand universe to Russell 3000 (add mid-cap and small-cap stocks)
- [ ] Upgrade to 3,600-slot architecture (3,000 active + 300 archive + 300 padding)
- [ ] Enhanced survivorship bias handling for small-cap delistings
- [ ] Multi-environment deployment (dev/staging/prod)
- [ ] Advanced risk management and position sizing
- [ ] Performance optimization for larger universe
- [ ] Comprehensive monitoring and alerting

## Next Steps

1. **Create detailed technical design document**
2. **Setup AWS CDK project structure**
3. **Deploy development environment**
4. **Implement data ingestion pipeline with error handling**
5. **Set up FinRL StockTradingEnv on SageMaker**
6. **Build monthly signal generation Lambda**
7. **Create React dashboard**
8. **Deploy to staging for testing**

---

**Version History:**

- v1.0: Initial design with daily trading signals, weekly retraining
- v2.0: Monthly trading frequency, monthly retraining, Russell 3000 scale
- v2.1: Fixed 3,600-slot universe architecture with archive strategy, temporal features for handling turnover, batch processing optimization
- v2.2: Corrected to daily recommendation generation with monthly retraining, portfolio state management, continuous portfolio approach aligned with FinRL design
- v2.3: Added model validation pipeline (2-month backtesting, 7-day shadow mode, rollback strategy), continuous portfolio state across retraining cycles
- v2.4: Updated to TypeScript for AWS infrastructure and APIs, 20-version model rollback, post-market data fetch (18:00 UTC), free Yahoo Finance option, QQQ baseline performance metrics, changed phases to milestones
- v2.5: Integrated fundamental analysis from day 1 - added 10 fundamental features (P/E, P/B, EPS, etc.) from Yahoo Finance, expanded to 32 features per stock (27 active + 5 padding), updated model size to 850-950 MB, adjusted costs to $54/month with free data sources, padded to power-of-2 for GPU optimization
- v2.6: Refactored to focus on high-level architecture, moved detailed workflows and implementation details to Low-Level Design document, corrected data fetch time to 22:00 UTC (~1 hour after market close)
- v2.7: Changed initial scope to Russell 1000 (from Russell 3000) for simpler MVP, updated model size to 300-400 MB, reduced costs to ~$31/month, improved validation to 6-month backtesting, added clear expansion path to Russell 3000 in Milestone 3

**Disclaimer**: This system is for educational and research purposes. Always consult with financial advisors before making investment decisions based on algorithmic signals.
