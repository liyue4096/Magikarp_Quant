# Trading System - High Level Design v2.0

## Overview

A serverless AWS-based trading recommendation system that fetches daily stock market data for Russell 3000 stocks (~3,000 stocks representing 98% of US market capitalization), uses FinRL reinforcement learning to generate daily trading recommendations, and provides real-time monitoring through a web dashboard. The system operates with daily data collection, daily recommendation generation, and monthly model retraining. Portfolio state is maintained across days within each month, then reset when the model is retrained.

## System Architecture

```
┌─────────────────┐    ┌──────────────┐    ┌─────────────────┐
│   3rd Party     │    │   Lambda     │    │      S3         │
│   Market API    │───▶│  Data Fetch  │───▶│  Raw Data       │
│  (Alpha Vantage,│    │   Function   │    │   Storage       │
│   Yahoo, etc.)  │    └──────────────┘    └─────────────────┘
└─────────────────┘                                │
                                                   │
┌─────────────────┐    ┌──────────────┐           │
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

- **Purpose**: Fetch daily market data for Russell 3000 stocks (~3,000 stocks)
- **Technology**: AWS Lambda (Python 3.9) with parallel processing
- **Trigger**: CloudWatch Events (daily at 6 AM UTC)
- **Data Sources**:
  - Primary: Polygon.io or Alpha Vantage Premium (bulk data support)
  - Backup: Yahoo Finance, IEX Cloud
- **Volume**: ~3,000 stocks × 365 days × ~1KB = ~1.1 GB/year
- **Output**: Raw market data stored in S3 (partitioned by date)
- **Error Handling**: Email alerts for API failures, automatic fallback to backup sources

### 2. Data Storage Layer

- **S3 Buckets**:
  - Raw market data (partitioned: s3://bucket/data/YYYY/MM/DD/) with lifecycle policies
  - Trained FinRL models (~300-400 MB per model) and artifacts
  - Processed features for 3,000 stocks
- **DynamoDB Tables**:
  - System metrics and performance data
  - Monthly trading signals for Russell 3000 stocks
  - Portfolio performance tracking
  - Stock universe metadata (Russell 3000 constituents)

### 3. ML Processing Layer (FinRL)

- **Framework**: FinRL open-source reinforcement learning
- **Environment**: StockTradingEnv for portfolio management across Russell 3000
- **Universe Design**: Fixed 3,600-slot architecture
  - Active stocks: 3,000 slots (current Russell 3000 members)
  - Archive stocks: 300 slots (recently removed, 12-month rolling window)
  - Padding: 300 slots (future growth buffer)
  - Rationale: Handles annual rebalancing (~200-250 stock changes) without model retraining
- **Scale**:
  - Observation space: 61,200 dimensions (3,600 stocks × 17 features)
  - Action space: 3,600 dimensions (portfolio weights, continuous 0-1)
  - Model size: ~450 MB (compressed)
- **Features**: 17 per stock
  - Base: OHLCV, technical indicators (RSI, MACD, Bollinger Bands), volume, volatility
  - Temporal: New stock indicator (3-month flag), tenure in index
  - Purpose: Model learns to handle new stocks and turnover intelligently
- **Algorithms**: PPO, A2C, SAC for trading strategies
- **Training**: Monthly automated retraining on SageMaker
  - Instance: ml.m5.2xlarge (8 vCPU, 32GB RAM) @ $0.538/hour
  - Duration: ~5-6 hours per training session
  - Frequency: First day of each month, before daily recommendations begin
  - Rationale: Monthly retraining provides 20-30 days of new data, balances freshness with stability
- **Reward Function**: Hybrid approach (0.6 * daily_return + 0.3 * sharpe_ratio - 0.1 * drawdown_penalty)
- **Portfolio State**: Maintained across days within each month, reset at monthly retraining
- **Output**: Daily portfolio target weights (0-1 for each stock) converted to actionable recommendations

### 4. Recommendation Generation Layer

- **Technology**: Lambda Container Image (recommended) or SageMaker Serverless Inference
- **Container**: ~950 MB (FinRL + model + dependencies)
- **Configuration**: 6 GB memory, 10-minute timeout
- **Frequency**: Daily (every trading day at market close)
- **Trigger**: Scheduled CloudWatch Events (6 PM UTC after market close)
- **Process**: 
  1. Load trained model and current portfolio state from DynamoDB
  2. Fetch today's market data (3,600 stocks × 17 features)
  3. Model predicts target portfolio weights (action space: 3,600 dimensions)
  4. Compare target weights vs current holdings
  5. Generate recommendations: BUY (increase weight), SELL (decrease weight), HOLD (maintain)
  6. Update portfolio state in DynamoDB
  7. Send daily email with top recommendations
- **Batch Processing**: 400 stocks per batch (9 batches total) for efficiency
- **Portfolio State Management**:
  - Tracked in DynamoDB: current holdings, cash balance, portfolio value
  - Updated daily based on model's target weights
  - Reset monthly when model is retrained
- **Recommendation Logic**:
  - BUY: Target weight > Current weight + threshold (e.g., +2%)
  - SELL: Target weight < Current weight - threshold (e.g., -2%)
  - HOLD: Within threshold range
- **Performance Tracking**: Daily portfolio value, monthly success rate calculation

### 5. Notification Layer

- **Service**: Amazon SES for email notifications
- **Types**:
  - **Critical**: Model failures, system down
  - **Warning**: Data quality issues, API rate limits
  - **Info**: Daily recommendations, monthly performance updates
- **Daily Email Content**: 
  - Top 20-30 BUY recommendations with target weights and confidence scores
  - Top 10-15 SELL recommendations
  - Current portfolio summary (holdings, cash, total value)
  - Daily P&L and performance metrics
- **Monthly Email Content**:
  - Model retraining summary
  - Monthly performance review
  - Risk metrics and portfolio analytics
- **Format**: HTML email with charts and signal summaries

### 6. Frontend Dashboard

- **Technology**: React + TypeScript hosted on AWS Amplify
- **Features**:
  - Real-time system health monitoring
  - Daily recommendation history (last 30 days)
  - Current portfolio state (holdings, cash, value)
  - Daily and monthly performance metrics
  - Interactive charts: portfolio value over time, daily P&L
  - System logs and error tracking
  - Russell 3000 coverage heatmap
  - Model performance: success rate of BUY/SELL recommendations

## Universe Architecture & Rebalancing Strategy

### Fixed-Size Universe (3,600 slots)

The system uses a fixed 3,600-slot architecture to handle Russell 3000 index changes without model retraining:

- **Active Stocks (3,000 slots)**: Current Russell 3000 members
- **Archive Stocks (300 slots)**: Recently removed stocks (12-month rolling window)
  - Preserves learned patterns and provides stability
  - Reduces position changes from 30-40% to ~5.6% annually
- **Padding (300 slots)**: Reserved for future index growth (20+ year capacity)

### Handling Annual Rebalancing

Russell 3000 rebalances annually with ~200-250 stock changes:

1. **New stocks**: Flagged with temporal indicators for gradual learning
2. **Removed stocks**: Moved to archive slots, kept for 12 months
3. **Model architecture**: Unchanged (always 3,600 slots)
4. **No retraining needed**: Model handles turnover automatically

### Temporal Features

Two additional features per stock help the model handle turnover:

- **New stock indicator**: Flags stocks added in last 3 months
- **Tenure tracking**: Months in index (positive for active, negative for archived)
- **Benefit**: Model learns to be cautious with new stocks, gradually increasing confidence

### Model Storage (S3)

```
s3://trading-system-ml-models/
├── production/
│   ├── latest/ (current model ~450 MB)
│   └── versioned models by month
├── archive/ (historical models)
└── backtest-results/ (performance metrics)
```

### Inference Options

**Lambda Container Image (Recommended)**

- Container: ~950 MB (model + dependencies)
- Memory: 6 GB, Timeout: 10 minutes
- Processing: 3-5 minutes for 3,600 stocks
- Cost: ~$0.20 per monthly inference

**SageMaker Serverless (Alternative)**

- Auto-scaling inference endpoint
- Cost: ~$0.20 per inference + $1/month storage

## Data Flow

### Daily Workflow (Every Trading Day)

1. **06:00 UTC**: Lambda fetches market data from APIs (3,000 Russell 3000 stocks)
2. **06:15 UTC**: Data stored in S3 with validation checks
3. **06:20 UTC**: Data quality validation and email alerts if issues found
4. **18:00 UTC** (After Market Close): Recommendation generation begins
   - Load trained model and current portfolio state
   - Process 3,600 stocks in 9 batches (400 stocks each)
   - Model outputs target portfolio weights
   - Compare with current holdings to generate BUY/SELL/HOLD signals
   - Update portfolio state in DynamoDB
5. **18:15 UTC**: Daily recommendations email sent (top 20-30 BUY, 10-15 SELL)
6. **Real-time**: Dashboard updates with latest recommendations and portfolio status

### Monthly Workflow (First Trading Day of Month)

1. **00:00 UTC**: Monthly retraining begins
   - SageMaker retrains FinRL model with last 30 days of data (3,600-slot universe)
   - Training duration: ~5-6 hours
2. **06:00 UTC**: Model training complete
3. **06:15 UTC**: Model validation and backtesting complete
4. **06:30 UTC**: New model (~450 MB) deployed to S3 and ECR for inference
5. **06:45 UTC**: Portfolio state reset in DynamoDB (fresh start for new month)
6. **18:00 UTC**: First daily recommendations with new model
7. **18:30 UTC**: Monthly summary email sent (previous month performance + new model info)
8. **Real-time**: Dashboard updates with new model performance metrics

## Technology Stack

| Layer          | Technology                | Purpose                |
| -------------- | ------------------------- | ---------------------- |
| Infrastructure | AWS CDK (TypeScript)      | Infrastructure as Code |
| Backend        | Python 3.9 + Lambda       | Serverless compute     |
| ML Framework   | FinRL + Stable-Baselines3 | Reinforcement Learning |
| Frontend       | React + TypeScript        | Dashboard UI           |
| Database       | DynamoDB + S3             | Data storage           |
| API            | API Gateway + Lambda      | REST endpoints         |
| Hosting        | AWS Amplify               | Frontend deployment    |
| Training       | SageMaker                 | ML model training      |
| Monitoring     | CloudWatch                | System monitoring      |

## Key Metrics & KPIs

### Trading Performance

- **12-Month Success Rate**: Percentage of profitable monthly signals
- **Annualized Sharpe Ratio**: Risk-adjusted returns
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
| Market Data | Russell 3000 stocks (Polygon.io)       | $50            |
| Lambda/ECR  | ~22 daily + 1 monthly + container storage | $15         |
| S3          | 50GB storage + API calls               | $6             |
| SageMaker   | 6hrs/month (ml.m5.2xlarge @ $0.538/hr) | $3.23/month    |
| DynamoDB    | 10GB storage, high R/W (daily updates) | $10            |
| SES         | ~22 daily + 1 monthly emails           | $1             |
| Amplify     | Hosting + builds                       | $5             |
| API Gateway | 10K requests/month                     | $1             |
| CloudWatch  | Logs and metrics                       | $8             |
| **Total**   |                                        | **~$99/month** |

**Cost Notes:**

- **Market Data**: Polygon.io Starter ($50/month) for Russell 3000 bulk data, or free Yahoo Finance for development
- **Training**: 6 hours × $0.538/hour = $3.23/month (3,600-slot universe with monthly retraining)
- **Inference**: Lambda Container (6GB, 5min) × 22 trading days = ~$4.40/month for daily recommendations
- **Storage**: ~50GB for 3,000 stocks × 365 days × 3 years of historical data
- **DynamoDB**: Increased for daily portfolio state updates and recommendation storage

## Risk Management

### Technical Risks

- **API Rate Limits**: Multiple data sources and exponential backoff
- **Model Performance**: Monthly backtesting and validation before deployment
- **System Failures**: Automated alerts and rollback procedures
- **Data Quality**: Validation checks with email notifications

### Financial Risks

- **Model Accuracy**: 12-month performance tracking with manual override
- **Market Volatility**: Monthly rebalancing reduces exposure
- **Regulatory**: Compliance with financial regulations

## Success Criteria

### Phase 1 (MVP - 4 weeks)

- [ ] Automated daily data ingestion with error handling
- [ ] Basic FinRL StockTradingEnv setup with portfolio state management
- [ ] Daily recommendation generation (BUY/SELL/HOLD logic)
- [ ] Portfolio state tracking in DynamoDB
- [ ] Email notifications with daily recommendations
- [ ] Simple dashboard with system status and current portfolio

### Phase 2 (Enhanced - 6 weeks)

- [ ] Advanced FinRL algorithms (PPO, A2C, SAC)
- [ ] Comprehensive dashboard with daily performance metrics
- [ ] Recommendation success rate tracking (30-day, 90-day)
- [ ] Automated monthly model retraining with portfolio reset
- [ ] Historical recommendation analysis

### Phase 3 (Production - 8 weeks)

- [ ] Multi-environment deployment (dev/staging/prod)
- [ ] Advanced risk management and position sizing
- [ ] Performance optimization for daily inference
- [ ] Comprehensive monitoring and alerting
- [ ] Backtesting framework for model validation

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

**Disclaimer**: This system is for educational and research purposes. Always consult with financial advisors before making investment decisions based on algorithmic signals.
