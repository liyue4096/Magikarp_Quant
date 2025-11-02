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

- **Purpose**: Fetch daily market data and quarterly fundamentals for Russell 3000 stocks (~3,000 stocks)
- **Technology**: AWS Lambda (TypeScript) with parallel processing
- **Trigger**: CloudWatch Events (daily at 6 PM UTC after market close)
- **Data Sources**:
  - **Price Data**: Yahoo Finance (yfinance) - free, reliable OHLCV data
  - **Fundamentals**: Yahoo Finance (yfinance) - free quarterly financial data
  - **Backup**: Polygon.io, Alpha Vantage, IEX Cloud
- **Data Types**:
  - Daily: OHLCV, volume, technical indicators
  - Quarterly: P/E, P/B, EPS, revenue, debt ratios, profit margins, market cap
- **Volume**: ~3,000 stocks × 365 days × ~2KB = ~2.2 GB/year
- **Output**: Raw market data and fundamentals stored in S3 (partitioned by date)
- **Error Handling**: Email alerts for API failures, automatic fallback to backup sources

### 2. Data Storage Layer

- **S3 Buckets**:
  - Raw market data (partitioned: s3://bucket/data/YYYY/MM/DD/) with lifecycle policies
  - Quarterly fundamentals (partitioned: s3://bucket/fundamentals/YYYY/QQ/)
  - Trained FinRL models (~700-800 MB per model) and artifacts
  - Processed features (technical + fundamental) for 3,600 stocks
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
  - Observation space: 115,200 dimensions (3,600 stocks × 32 features)
  - Action space: 3,600 dimensions (portfolio weights, continuous 0-1)
  - Model size: ~850-950 MB (compressed)
- **Features**: 32 per stock (27 active + 5 padding for future expansion)
  - **Technical (15)**: OHLCV, RSI, MACD, Bollinger Bands, volume, volatility, momentum indicators
  - **Fundamental (10)**: P/E ratio, P/B ratio, EPS, revenue growth, debt-to-equity, ROE, profit margin, market cap, beta, dividend yield
  - **Temporal (2)**: New stock indicator (3-month flag), tenure in index
  - **Padding (5)**: Reserved for future features (news sentiment, analyst ratings, etc.)
  - **Update Frequency**: Technical features daily, fundamental features quarterly (forward-filled)
  - **Purpose**: Combines price action with company fundamentals, padded to 32 for GPU optimization and future expansion
- **Algorithms**: PPO, A2C, SAC for trading strategies
- **Training**: Monthly automated retraining on SageMaker
  - Instance: ml.m5.2xlarge (8 vCPU, 32GB RAM) @ $0.538/hour
  - Duration: ~5-6 hours per training session
  - Frequency: First day of each month
  - Rationale: Monthly retraining provides 20-30 days of new data, balances freshness with stability
- **Model Validation Pipeline**:
  - **Backtesting**: 2-month rolling window on recent unseen data
  - **Shadow Mode**: 7-day parallel execution without real trades
  - **Rollback**: Last 20 model versions kept as safety net
  - **Auto-rollback triggers**: Loss > 5% in 3 days, Sharpe < threshold
- **Reward Function**: Hybrid approach (0.6 * daily_return + 0.3 * sharpe_ratio - 0.1 * drawdown_penalty)
- **Portfolio State**: Continuously maintained across days and months (no resets)
- **Output**: Daily portfolio target weights (0-1 for each stock) converted to actionable recommendations

### 4. Recommendation Generation Layer

- **Technology**: Lambda Container Image (recommended) or SageMaker Serverless Inference
- **Container**: ~1.3 GB (FinRL + model + dependencies)
- **Configuration**: 8 GB memory, 10-minute timeout
- **Frequency**: Daily (every trading day at market close)
- **Trigger**: Scheduled CloudWatch Events (6 PM UTC after market close)
- **Process**: 
  1. Load trained model and current portfolio state from DynamoDB
  2. Fetch today's market data (3,600 stocks × 32 features: 15 technical + 10 fundamental + 2 temporal + 5 padding)
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
│   ├── active/ (current production model ~900 MB)
│   └── rollback/ (last 20 model versions for safety)
├── shadow/ (candidate model in validation)
├── archive/ (historical models, timestamped)
└── validation/
    ├── backtest-results/ (2-month performance)
    └── shadow-metrics/ (7-day comparison data)
```

### Inference Options

**Lambda Container Image (Recommended)**

- Container: ~1.3 GB (model + dependencies)
- Memory: 8 GB, Timeout: 10 minutes
- Processing: 3-5 minutes for 3,600 stocks (32 features each)
- Cost: ~$0.25 per daily inference

**SageMaker Serverless (Alternative)**

- Auto-scaling inference endpoint
- Cost: ~$0.20 per inference + $1/month storage

## Data Flow

### Daily Workflow (Every Trading Day)

1. **18:00 UTC** (After Market Close): Lambda fetches market data from APIs (3,000 Russell 3000 stocks)
   - Daily: OHLCV, volume data
   - Quarterly: Fundamentals (cached, only fetched if earnings released)
2. **18:15 UTC**: Data stored in S3 with validation checks
3. **18:20 UTC**: Feature engineering
   - Calculate 15 technical indicators per stock
   - Load latest fundamentals (forward-filled from last quarter)
   - Add 2 temporal features
   - Add 5 padding features (zero-filled, reserved for future expansion)
   - Result: 3,600 stocks × 32 features
4. **18:25 UTC**: Data quality validation and email alerts if issues found
5. **18:30 UTC**: Recommendation generation begins
   - Load trained model and current portfolio state
   - Process 3,600 stocks in 9 batches (400 stocks × 32 features each)
   - Model outputs target portfolio weights
   - Compare with current holdings to generate BUY/SELL/HOLD signals
   - Update portfolio state in DynamoDB
5. **18:45 UTC**: Daily recommendations email sent (top 20-30 BUY, 10-15 SELL)
6. **Real-time**: Dashboard updates with latest recommendations and portfolio status

### Monthly Workflow (First Trading Day of Month)

1. **00:00 UTC**: Monthly retraining begins
   - SageMaker retrains FinRL model with last 30 days of data (3,600-slot universe)
   - Training data: 30 days × 3,600 stocks × 32 features (technical + fundamental + temporal + padding)
   - Training duration: ~6-8 hours
2. **06:00 UTC**: Model training complete
3. **06:15 UTC**: Model validation pipeline begins
   - Backtesting on recent 2-month window
   - Performance comparison vs previous model
   - Automated quality checks (Sharpe ratio, drawdown, win rate)
4. **06:30 UTC**: If validation passes, deploy to shadow mode
   - New model runs in parallel (no real trades)
   - Previous model continues production recommendations
   - Both models tracked for 7 days
5. **Day 8**: Shadow mode evaluation
   - Compare shadow vs production performance
   - Manual approval or auto-promotion if metrics exceed thresholds
6. **Post-approval**: New model promoted to production
   - Previous model archived as rollback option (last 20 versions kept)
   - Portfolio state continues (no reset - continuous management)
7. **18:00 UTC**: Daily recommendations continue with active model
8. **18:30 UTC**: Monthly summary email sent (performance review + model status)

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
| Market Data | Russell 3000 daily + fundamentals (Yahoo Finance) | $0 |
| Lambda/ECR  | ~22 daily + 1 monthly + container storage | $18         |
| S3          | 60GB storage + API calls               | $7             |
| SageMaker   | 7hrs/month (ml.m5.2xlarge @ $0.538/hr) | $3.77/month    |
| DynamoDB    | 10GB storage, high R/W (daily updates) | $10            |
| SES         | ~22 daily + 1 monthly emails           | $1             |
| Amplify     | Hosting + builds                       | $5             |
| API Gateway | 10K requests/month                     | $1             |
| CloudWatch  | Logs and metrics                       | $8             |
| **Total**   |                                        | **~$54/month** |

**Cost Notes:**

- **Market Data**: Free with Yahoo Finance (yfinance library) for daily OHLCV + quarterly fundamentals
- **Training**: 7 hours × $0.538/hour = $3.77/month (3,600-slot universe, 27 features, monthly retraining)
- **Inference**: Lambda Container (8GB, 5min) × 22 trading days = ~$5.50/month for daily recommendations
- **Storage**: ~60GB for 3,000 stocks × 365 days × 3 years (price + fundamentals)
- **DynamoDB**: Increased for daily portfolio state updates and recommendation storage
- **Total savings**: $45/month vs paid data sources by using free Yahoo Finance

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

### Milestone 1 (MVP - 4 weeks)

- [ ] Automated daily data ingestion (price + fundamentals) with error handling
- [ ] Quarterly fundamentals fetching and caching from Yahoo Finance
- [ ] Feature engineering pipeline (15 technical + 10 fundamental + 2 temporal + 5 padding features)
- [ ] Basic FinRL StockTradingEnv setup with 32-feature observation space
- [ ] Portfolio state tracking in DynamoDB
- [ ] Daily recommendation generation (BUY/SELL/HOLD logic)
- [ ] Email notifications with daily recommendations
- [ ] Simple dashboard with system status and current portfolio

### Milestone 2 (Enhanced - 6 weeks)

- [ ] Advanced FinRL algorithms (PPO, A2C, SAC)
- [ ] Model validation pipeline (backtesting + shadow mode)
- [ ] Comprehensive dashboard with daily performance metrics
- [ ] Recommendation success rate tracking (30-day, 90-day)
- [ ] Automated monthly model retraining with validation gates
- [ ] Model versioning and rollback capability
- [ ] Historical recommendation analysis

### Milestone 3 (Production - 8 weeks)

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
- v2.3: Added model validation pipeline (2-month backtesting, 7-day shadow mode, rollback strategy), continuous portfolio state across retraining cycles
- v2.4: Updated to TypeScript for AWS infrastructure and APIs, 20-version model rollback, post-market data fetch (18:00 UTC), free Yahoo Finance option, QQQ baseline performance metrics, changed phases to milestones
- v2.5: Integrated fundamental analysis from day 1 - added 10 fundamental features (P/E, P/B, EPS, etc.) from Yahoo Finance, expanded to 32 features per stock (27 active + 5 padding), updated model size to 850-950 MB, adjusted costs to $54/month with free data sources, padded to power-of-2 for GPU optimization

**Disclaimer**: This system is for educational and research purposes. Always consult with financial advisors before making investment decisions based on algorithmic signals.
