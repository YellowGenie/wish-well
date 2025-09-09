#!/bin/bash
# Backend Deployment Script for Dozyr API
# Usage: ./deploy.sh [production|staging]

set -e

ENVIRONMENT=${1:-production}
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

echo "🚀 Starting deployment process for $ENVIRONMENT environment..."

# Load environment variables
if [ -f ".env.$ENVIRONMENT" ]; then
    export $(cat .env.$ENVIRONMENT | grep -v '^#' | xargs)
    echo "✅ Environment variables loaded from .env.$ENVIRONMENT"
else
    echo "❌ Environment file .env.$ENVIRONMENT not found!"
    exit 1
fi

# Validate required environment variables
required_vars=(
    "SSH_USER"
    "SSH_HOST"
    "DEPLOY_PATH"
    "DB_HOST"
    "DB_USER"
    "DB_NAME"
    "JWT_SECRET"
)

echo "🔍 Validating environment variables..."
for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo "❌ Required environment variable $var is not set"
        exit 1
    fi
done
echo "✅ All required environment variables are set"

# Create deployment package
echo "📦 Creating deployment package..."
rm -rf deploy-temp
mkdir deploy-temp

# Copy application files
cp -r . deploy-temp/
cd deploy-temp

# Remove development files
rm -rf .git
rm -rf node_modules
rm -rf tests
rm -rf .env*
rm -f deploy.sh
rm -f README.md

# Copy production environment
cp "../.env.$ENVIRONMENT" .env

# Install production dependencies
echo "📚 Installing production dependencies..."
npm ci --production

# Create deployment archive
cd ..
tar -czf "backend-$ENVIRONMENT-$TIMESTAMP.tar.gz" -C deploy-temp .
rm -rf deploy-temp

echo "✅ Deployment package created: backend-$ENVIRONMENT-$TIMESTAMP.tar.gz"

# Upload and deploy
echo "🚀 Uploading to server..."
scp "backend-$ENVIRONMENT-$TIMESTAMP.tar.gz" "$SSH_USER@$SSH_HOST:/tmp/"

echo "🔄 Deploying on server..."
ssh "$SSH_USER@$SSH_HOST" << EOF
    set -e
    cd "$DEPLOY_PATH"
    
    # Create backup of current deployment
    if [ -d "current" ]; then
        echo "💾 Creating backup..."
        cp -r current "backup-$TIMESTAMP"
        
        # Keep only last 5 backups
        ls -1d backup-* | head -n -5 | xargs rm -rf 2>/dev/null || true
    fi
    
    # Extract new deployment
    echo "📂 Extracting new deployment..."
    mkdir -p "new-$TIMESTAMP"
    cd "new-$TIMESTAMP"
    tar -xzf "/tmp/backend-$ENVIRONMENT-$TIMESTAMP.tar.gz"
    
    # Run database migrations (if available)
    if [ -f "migrations.js" ] || [ -f "utils/migrate.js" ]; then
        echo "🗄️ Running database migrations..."
        node utils/migrate.js || echo "⚠️ No migrations to run"
    fi
    
    # Stop current application
    echo "⏹️ Stopping current application..."
    pm2 stop dozyr-backend || echo "⚠️ Application was not running"
    
    # Switch to new deployment
    cd ..
    if [ -d "current" ]; then
        rm -rf current
    fi
    mv "new-$TIMESTAMP" current
    cd current
    
    # Start application with PM2
    echo "▶️ Starting application..."
    if [ -f "ecosystem.config.js" ]; then
        pm2 start ecosystem.config.js --env $ENVIRONMENT
    else
        pm2 start server.js --name "dozyr-backend" --env $ENVIRONMENT
    fi
    
    pm2 save
    
    # Cleanup
    rm "/tmp/backend-$ENVIRONMENT-$TIMESTAMP.tar.gz"
    
    echo "✅ Deployment completed successfully!"
    pm2 status
EOF

# Cleanup local files
rm "backend-$ENVIRONMENT-$TIMESTAMP.tar.gz"

echo "🎉 Deployment to $ENVIRONMENT completed successfully!"
echo "🔗 Application should be available at: $CLIENT_URL"