<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Watchdog Supervisor — Process Spawn & Restart Loop

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** Not Started
**Priority:** High
**Effort:** (set per-ticket)
**Type:** Feature Task / Infrastructure
**Tags:** watchdog, supervisor, process, restart, ci
**Epic:** epic-recursive-self-improvement

Process supervisor that spawns the loop-lore server, captures stdio, monitors liveness, and restarts on crash with exponential backoff. Lives at `src/server/watchdog/supervisor.ts`; CLI entrypoint at `src/server/watchdog/cli.ts` (run via `bun run watchdog`).

## Core Features

- `spawnServer(): ChildProcess` — fork the existing `src/server/start.ts` with `LOOP_LORE_WATCHDOG=1` env var so `start.ts` skips its `uncaughtException` -> `process.exit(0)` branch (currently at `src/server/start.ts:227-246`).
- `restartPolicy(): BackoffSchedule` — exponential backoff: 1s -> 2s -> 4s -> 8s -> 16s -> 32s -> 60s (cap). Reset on successful health probe after 5 minutes uptime.
- `monitor(child): void` — async loop polling `/health` every 5s; if 3 consecutive misses, mark child unhealthy and trigger restart.
- `crashThreshold: 5 failures in 60s -> stop and alert` (admin + log + notification).
- `signal handling` — on `SIGTERM`/`SIGINT`, forward to child with 30s graceful timeout; supervisor exits 0 only after child exits.

## Acceptance Criteria

- [ ] `bun run watchdog` starts the server under supervision and survives a `kill -9 <pid>` test (auto-restart within backoff window)
- [ ] 5 simulated crashes within 60s trigger stop + admin alert
- [ ] Graceful `SIGTERM` propagates to the child; supervisor exits 0 only after child exits
- [ ] `LOOP_LORE_WATCHDOG=1` env var disables the `uncaughtException` branch in `start.ts`
- [ ] No double-process; `ps` shows exactly one server child per supervisor
- [ ] Unit tests for spawn/monitor/restart policy; integration test for crash-threshold

## Files

- `src/server/watchdog/supervisor.ts` — new
- `src/server/watchdog/cli.ts` — new
- `src/server/start.ts` — guard `uncaughtException`/`unhandledRejection` on `LOOP_LORE_WATCHDOG=1`
- `src/server/watchdog/supervisor.test.ts` — new

## Notes / Verification

- Reference patterns: `systemd`, `pm2`, `foreman`, `overmind`, `forego` — all use child-process fork + stdio capture; ours is Bun-native (`Bun.spawn`).
- `Bun.spawn` is Bun's child_process equivalent; stdio capture via `stdout: 'pipe'` + `ReadableStream`.
- Existing `src/server/start.ts` already has graceful shutdown; supervisor only adds spawn/monitor/restart.

