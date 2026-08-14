#!/bin/bash
# SQLite Backup Script for Loop-Lore
# TODO: Finalize WAL mode handling & encryption parameters
# TODO: Test network push mechanism with actual storage

set -euo pipefail

# TODO: Make these configurable via environment variables
BACKUP_DIR="${BACKUP_DIR:-/tmp}"
DB_PATH="${DB_PATH:-/data/loop-lore.db}"
NETWORK_MOUNT="${NETWORK_MOUNT:-/mnt/backups/db}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

# Generate timestamped backup filename
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/backup_${TIMESTAMP}.db"
ENCRYPTED_FILE="${BACKUP_FILE}.gpg"
CHECKSUM_FILE="${BACKUP_FILE}.sha256"

# TODO: Add proper error handling for WAL mode
# SQLite WAL mode requires copying all files (db, db-wal, db-shm)
# TODO: Use `sqlite3 .backup` command if available
# TODO: Otherwise, copy files atomically with fuser/lsof checks

echo "Starting backup: ${TIMESTAMP}" >&2

# Step 1: Create local backup (atomic copy for SQLite)
# TODO: Implement WAL-aware copy logic
# TODO: Handle database locks gracefully
cp -a "${DB_PATH}" "${BACKUP_FILE}"
cp -a "${DB_PATH}-wal" "${BACKUP_FILE}-wal" 2>/dev/null || true
cp -a "${DB_PATH}-shm" "${BACKUP_FILE}-shm" 2>/dev/null || true

# Step 2: Compress backup (optional but saves space)
# TODO: Add compression flag check
tar -czf "${BACKUP_FILE}.tar.gz" -C "${BACKUP_DIR}" "$(basename "${BACKUP_FILE}")" \
    "$(basename "${BACKUP_FILE}")-wal" 2>/dev/null || true

# Step 3: Encrypt backup
# TODO: Verify GPG recipient/key exists in environment
# TODO: Add error handling for encryption failures
gpg --batch --yes --encrypt --recipient "${GPG_RECIPIENT:-backup@loop-lore.local}" \
    "${BACKUP_FILE}" > "${BACKUP_FILE}.gpg" 2>/dev/null || \
    echo "Warning: GPG encryption failed, storing unencrypted" >&2

# Step 4: Generate checksum
sha256sum "${BACKUP_FILE}.gpg" > "${CHECKSUM_FILE}"

# Step 5: Push to network storage
# TODO: Verify network mount is available
# TODO: Add retry logic for network failures
# TODO: Use rclone or scp based on NETWORK_STORAGE_TYPE
if [ -d "${NETWORK_MOUNT}" ]; then
    # TODO: Implement rclone sync or scp
    # rclone copy "${BACKUP_FILE}.gpg" remote:backups/db/
    # scp "${BACKUP_FILE}.gpg" user@storage:/backups/db/
    cp "${BACKUP_FILE}.gpg" "${NETWORK_MOUNT}/"
    cp "${CHECKSUM_FILE}" "${NETWORK_MOUNT}/"
    echo "Backup pushed to network storage" >&2
else
    echo "Warning: Network mount not available at ${NETWORK_MOUNT}" >&2
fi

# Step 6: Cleanup old backups
find "${BACKUP_DIR}" -name "backup_*.db*" -mtime +${RETENTION_DAYS} -delete
find "${NETWORK_MOUNT}" -name "backup_*.db*" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true

# Step 7: Verify integrity (optional, can be separate script)
# TODO: Implement verification script
# Verify checksum
# sha256sum -c "${CHECKSUM_FILE}"

echo "Backup completed: ${TIMESTAMP}" >&2