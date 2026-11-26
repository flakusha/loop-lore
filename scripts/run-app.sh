#!/bin/sh
# SPDX-License-Identifier: LGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Loop Lore Contributors
#
# Supervised start wrapper for loop-lore (first-boot S2 slice).
#
# Install target: /opt/loop-lore/scripts/run-app.sh (see
# docs/ops/bare-metal/systemd/loop-lore.service). Derives the repo root from
# its own location — no hardcoded paths — then execs the app, so the
# supervisor's signals reach the process directly and exit codes propagate
# unchanged: 75 first-boot contention retry, 0 clean shutdown, 1 crash.
# All args forward to the app.
#
# Prefers the `bun run build:server` bundle (dist/index.js) when present,
# otherwise runs the source entry (same command as `bun run start`).
set -eu
ROOT="$(CDPATH= cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [ -f "$ROOT/dist/index.js" ]; then
  exec bun "$ROOT/dist/index.js" "$@"
fi
exec bun run "$ROOT/src/server/index.ts" "$@"
