#!/usr/bin/env bash
# SPDX-License-Identifier: LGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Loop Lore Contributors

# Bash wrapper for shared credential loader
# Usage: eval "$(./scripts/worktree/load-credentials.sh)"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# credentials.mjs prints KEY=value lines; eval them into the shell
bun run "${SCRIPT_DIR}/utils/credentials.mjs"
