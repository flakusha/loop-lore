#!/bin/bash
# SQLite Backup Validation Script for Loop-Lore
# TODO: Finalize database integrity checks & error reporting
# TODO: Add integration with monitoring system (Prometheus, etc.)

set -euo pipefail

# TODO: Make these configurable via environment variables
BACKUP_DIR="${BACKUP_DIR:-/tmp}"
DB_PATH="${DB_PATH:-/data/loop-lore.db}"
NETWORK_MOUNT="${NETWORK_MOUNT:-/mnt/backups/db}"
VALIDATION_DIR="${VALIDATION_DIR:-/tmp/validation}"
GPG_RECIPIENT="${GPG_RECIPIENT:-backup@loop-lore.local}"

# Find the most recent backup file
# TODO: Handle multiple backup files more robustly
LATEST_BACKUP=$(ls -t "${BACKUP_DIR}"/backup_*.db.gpg 2>/dev/null | head -1)

if [ -z "${LATEST_BACKUP}" ]; then
    echo "ERROR: No backup file found in ${BACKUP_DIR}" >&2
    exit 1
fi

echo "Validating backup: ${LATEST_BACKUP}" >&2

# Step 1: Verify GPG decryption
# TODO: Add proper error handling for GPG failures
DECRYPTED_FILE="${VALIDATION_DIR}/decrypted_backup.db"
mkdir -p "${VALIDATION_DIR}"

gpg --batch --yes --decrypt "${LATEST_BACKUP}" > "${DECRYPTED_FILE}" 2>/dev/null || {
    echo "ERROR: Failed to decrypt backup ${LATEST_BACKUP}" >&2
    exit 1
}

# Step 2: Verify checksum
# TODO: Match checksum file path correctly
CHECKSUM_FILE="${LATEST_BACKUP%.gpg}.sha256"
if [ -f "${CHECKSUM_FILE}" ]; then
    sha256sum -c "${CHECKSUM_FILE}" || {
        echo "ERROR: Checksum verification failed for ${LATEST_BACKUP}" >&2
        exit 1
    }
fi

# Step 3: Test database integrity
# TODO: Use sqlite3 if available, otherwise use Bun-based check
# TODO: Handle WAL files properly in validation
if command -v sqlite3 >/dev/null 2>&1; then
    # Copy WAL files for complete validation
    cp "${LATEST_BACKUP%.gpg}" "${VALIDATION_DIR}/" 2>/dev/null || true
    cp "${LATEST_BACKUP%.gpg}-wal" "${VALIDATION_DIR}/" 2>/dev/null || true
    cp "${LATEST_BACKUP%.gpg}-shm" "${VALIDATION_DIR}/" 2>/dev/null || true

    # Run integrity check
    INTEGRITY_RESULT=$(sqlite3 "${DECRYPTED_FILE}" "PRAGMA integrity_check;")
    if [ "${INTEGRITY_RESULT}" != "ok" ]; then
        echo "ERROR: Database integrity check failed: ${INTEGRITY_RESULT}" >&2
        exit 1
    fi
else
    echo "Warning: sqlite3 not available, skipping integrity check" >&2
    # TODO: Implement Bun-based integrity check
fi

# Step 4: Verify schema (optional)
# TODO: Compare schema version with production
# TODO: Check for expected tables (users, worlds, chats, etc.)

# Step 5: Cleanup
rm -rf "${VALIDATION_DIR}"
echo "Backup validation passed: ${LATEST_BACKUP}" >&2

# Step 6: Report status
# TODO: Send metrics to monitoring system
# TODO: Update backup health endpoint
echo "Validation timestamp: $(date)" >&2
exit 0