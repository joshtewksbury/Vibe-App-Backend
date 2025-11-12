#!/bin/bash

# Script to restore venue icons on production database
# This runs the restoration script against the Railway database

echo "🚀 Restoring venue icons on production database..."
echo ""

# Check if DATABASE_URL is set for Railway
if [ -z "$DATABASE_URL_PRODUCTION" ]; then
    echo "❌ DATABASE_URL_PRODUCTION not set"
    echo "Please run: export DATABASE_URL_PRODUCTION='your-railway-database-url'"
    exit 1
fi

# Temporarily set DATABASE_URL to production
export DATABASE_URL="$DATABASE_URL_PRODUCTION"

# Run the restoration script
npx ts-node scripts/restore-icons-with-mapping.ts

echo ""
echo "✨ Production icon restoration complete!"
