#!/bin/bash

# Database Backup Script for Railway PostgreSQL
# Usage: ./scripts/backup-database.sh

# Set backup directory
BACKUP_DIR="./backups"
mkdir -p "$BACKUP_DIR"

# Generate timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/vibe_backup_$TIMESTAMP.sql"

# Get DATABASE_URL from Railway
if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL environment variable not set"
  echo "Run: railway run ./scripts/backup-database.sh"
  exit 1
fi

echo "Starting database backup..."
echo "Backup file: $BACKUP_FILE"

# Create backup using pg_dump
pg_dump "$DATABASE_URL" > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
  echo "✅ Backup completed successfully!"
  echo "File size: $(du -h "$BACKUP_FILE" | cut -f1)"

  # Compress backup
  gzip "$BACKUP_FILE"
  echo "✅ Compressed to: ${BACKUP_FILE}.gz"

  # Keep only last 7 backups
  cd "$BACKUP_DIR"
  ls -t vibe_backup_*.sql.gz | tail -n +8 | xargs rm -f
  echo "✅ Old backups cleaned up (keeping last 7)"

  echo ""
  echo "To restore this backup, run:"
  echo "railway run psql \$DATABASE_URL < ${BACKUP_FILE%.gz}"
else
  echo "❌ Backup failed!"
  exit 1
fi
