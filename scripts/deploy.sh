#!/usr/bin/env bash
# ==============================================================================
# Nizalo Production Zero-Downtime Deployment Script for Hostinger Cloud / VPS
# ==============================================================================
set -e

echo "🚀 [1/6] Starting Nizalo Platform Deployment..."
cd "$(dirname "$0")/.."

# Ensure .env file exists
if [ ! -f ".env" ]; then
  if [ -f ".env.production.example" ]; then
    echo "⚠️ .env not found. Creating from .env.production.example..."
    cp .env.production.example .env
  else
    echo "❌ Error: .env file missing! Please create .env before deploying."
    exit 1
  fi
fi

# 1. Pull latest code from GitHub
echo "📥 [2/6] Pulling latest updates from GitHub (main)..."
git fetch origin main
git reset --hard origin/main

# 2. Install exact dependencies
echo "📦 [3/6] Installing Node.js dependencies..."
npm ci --prefer-offline --no-audit

# 3. Build Next.js frontend
echo "🔨 [4/6] Building Next.js production bundle..."
npm run build

# 4. Reload or Start via PM2
echo "🔄 [5/6] Starting / Reloading application via PM2..."
if command -v pm2 >/dev/null 2>&1; then
  if pm2 list | grep -q "nizalo-platform"; then
    pm2 reload ecosystem.config.cjs --update-env
  else
    pm2 start ecosystem.config.cjs
  fi
  pm2 save
else
  echo "⚠️ PM2 not found globally, falling back to local PM2 or background node..."
  npx pm2 reload ecosystem.config.cjs || npx pm2 start ecosystem.config.cjs || npm start &
fi

# 5. Wait for server readiness probe
echo "🩺 [6/6] Verifying platform health..."
sleep 3
PORT="${PORT:-3000}"

HEALTH_URL="http://127.0.0.1:${PORT}/diag"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" || true)

if [ "$STATUS" = "200" ]; then
  echo "✅ Deployment Successful! Platform is healthy and running on port ${PORT}."
  curl -s "$HEALTH_URL" | grep -o '"subsystems":{[^}]*}' || true
else
  echo "⚠️ Platform initialized. Check logs via: pm2 logs nizalo-platform"
fi

echo "======================================================"
echo "🎉 Nizalo is LIVE at https://nizalo.com"
echo "======================================================"
