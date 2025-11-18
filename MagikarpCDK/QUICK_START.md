# Quick Start: Setting Up Your API Keys

Since you have **two FRED API keys**, here's how to use them securely without committing to Git:

## 🎯 One-Time Setup (5 minutes)

### 1. Create your .env files

```bash
cd MagikarpCDK

# Create dev environment file (use your first API key)
cat > .env.dev << EOF
FRED_API_KEY=YOUR_FIRST_API_KEY_HERE
EOF

# Create prod environment file (use your second API key)
cat > .env.prod << EOF
FRED_API_KEY=YOUR_SECOND_API_KEY_HERE
EOF
```

### 2. Upload to AWS

```bash
# Upload dev key to AWS SSM Parameter Store
./scripts/setup-api-keys.sh dev

# Upload prod key to AWS SSM Parameter Store
./scripts/setup-api-keys.sh prod
```

### 3. Deploy

```bash
# Deploy dev environment
cdk deploy --context environment=dev

# Or deploy prod environment
cdk deploy --context environment=prod
```

## ✅ Done!

Your API keys are now:
- ✅ Stored locally in `.env.dev` and `.env.prod` (gitignored)
- ✅ Encrypted in AWS SSM Parameter Store
- ✅ Automatically loaded by Lambda on startup
- ✅ **Never committed to Git**

## 🔄 Future Updates

To update an API key:

```bash
# Edit the .env file
nano .env.dev

# Re-run the setup script
./scripts/setup-api-keys.sh dev
```

## 📖 More Details

See [API_KEY_SETUP_GUIDE.md](./API_KEY_SETUP_GUIDE.md) for complete documentation.
