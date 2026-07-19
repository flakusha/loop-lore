#!/usr/bin/env bash
set -euo pipefail

# GPG passphrase unlock for loop-lore agent commits
# Reads .credentials.env and signs test data to warm the gpg-agent cache.
# Must be run in a REAL TERMINAL (not inside opencode) — pinentry needs a TTY.

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"

# Source agent credentials
if [[ ! -f "$REPO_ROOT/.credentials.env" ]]; then
    echo "Error: .credentials.env not found at $REPO_ROOT/.credentials.env"
    echo "Copy .credentials.env.example and fill in your values."
    exit 1
fi

# shellcheck source=/dev/null
source "$REPO_ROOT/.credentials.env"

if [[ -z "${AGENT_GPG_KEY_ID:-}" ]]; then
    echo "Error: AGENT_GPG_KEY_ID not set in .credentials.env"
    exit 1
fi

echo "Unlocking GPG key: ${AGENT_GPG_KEY_ID:0:8}..."

# Sign test data to prompt for passphrase and cache it in gpg-agent
if echo "unlock" | gpg --pinentry-mode loopback \
       --sign --local-user "$AGENT_GPG_KEY_ID" \
       --output /dev/null 2>/dev/null; then
    echo "Passphrase cached."
    echo "You can now run agent commits. Cache expires after gpg-agent TTL."
else
    echo "Failed — enter passphrase in the pinentry dialog above."
    echo "If pinentry doesn't appear, check:"
    echo "  gpg-connect-agent 'GETINFO pinentry_program' /bye"
    exit 1
fi
