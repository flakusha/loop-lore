#!/usr/bin/env bash
# SPDX-License-Identifier: LGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Loop Lore Contributors

# Thin backward-compat wrapper — all logic lives in the TS dispatcher.
# Usage: ./scripts/worktree.sh <command> [args]
# New invocations should use: bun run scripts/worktree/ <command> [args]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec bun run "${SCRIPT_DIR}/worktree/index.mjs" "$@"