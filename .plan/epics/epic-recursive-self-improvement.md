<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Recursive Self-Improvement — Watchdog, Agent Loop & On-the-Fly Development

**Overview:** (see sections below)

**Status:** Not Started
**Status Note:** Filed 2026-09-27 from a one-week sweep of `dev` commits (2026-09-20 -> 2026-09-27), `.plan/backlog/*` open queues, and recurring failure clusters surfaced in the worktree log. Cross-references the existing `epic-resource-provision.md` (programmatic compute), `epic-testing-qa.md` (failure modes), `epic-code-quality.md` (size-debt cycle), and `epic-benchmark-ci-regression.md` (perf gates). No overlap with `epic-resource-provision.md` — that epic provisions **external** compute/credentials; this epic covers the **internal** watchdog + agent development loop that operates on `loop-lore` itself.

**Priority:** High
**Effort:** Very High
**Type:** Infrastructure Epic
**Tags:** watchdog, supervisor, agent, agentic-development, on-the-fly, hot-reload, self-heal, sandbox, ci, cicd, observability, automation, programmatic-api, dev-loop

## Summary

`loop-lore` ships its own runtime, its own CI pipeline (`.github/workflows/{ci,release,deploy}.yml`), its own plan/issue tracker (`.plan/`), and its own agent harness (`giwt`, `omp`, `bun run check`). It **does not** ship the loop that lets it **fix itself**: the only thing watching the running server is an external sysadmin or a human agent running `giwt` from another terminal, and the only "improvement" cycle is *commit -> push -> CI -> merge -> restart*.

This epic closes that loop. It has three coordinated parts:

1. **Watchdog** — a process supervisor (systemd-style) that lives in the repo, runs the server, restarts on crash, exposes health/liveness/readiness probes, persists crash telemetry, and surfaces "watchdog detected X consecutive failures" as a structured log + admin UI page. Reference patterns: `systemd`, `pm2`, `foreman`, `overmind`, `forego`, Docker `HEALTHCHECK`, Kubernetes probes.

2. **Agent Development Loop** — a programmatic API surface (`/api/v1/agent/*`) that lets an authorized agent (the existing `omp` harness, `giwt`, or a third-party supervisor like **OpenClaw**, **Hermes Agent**, or **OpenCode**) spawn a worktree, write a patch, run `bun run check` against it, surface the report, and merge — **all without leaving the running instance**. This is the "assistant/agent able to do improvement and development of application on the fly" requirement.

3. **CI/CD Tightening** — promote the existing ad-hoc `bun run check` gate into a continuous loop: smoke gate that runs every commit (sub-minute), heavy gate that runs nightly + on PR, watchdog-driven gate that runs whenever the watchdog detects a crash.

Reference external patterns surveyed 2026-09-27: **OpenClaw** (open-source agentic desktop pet — supervisor pattern), **Hermes Agent** (Nous Research — agent harness), **OpenCode** (sst/opencode — TUI coding agent), **omp** (this project's own harness), **GitHub Copilot Coding Agent**, **Devin**, **Claude Code**. The common pattern is: *agent receives task -> agent edits file -> agent runs check -> agent surfaces report -> human/auto merges*.

## Why now

Sep-2026 weekly sweep (`.plan/backlog/open.md`, `.plan/backlog/open-untriaged.md`, worktree log `tree/`) shows the same classes of bug recurring every week:

| Pattern                              | Recent examples (Sep-2026)                                                                                                                                                              | Watchdog/agent fix                                                                                                                       |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Alpine hydration aborts**          | `BUG-alpine-init-hydration` — `Object.defineProperty on non-object` x12+ in `htmx-alpine.browser.ts`                                                                                     | Watchdog catches browser-test crash; agent regenerates the test against `chatState()` contract and patches the missing template vars. |
| **Telemetry PII / hash mismatch**    | `BUG-telemetry-stores-raw-client-body`, `BUG-analytics-per-user-routes-filter-telemetry-events-by-raw-ids`, telemetry `chatId` drift                                                    | Watchdog emits `telemetry_hash_drift` alert; agent opens ticket, writes regression test, patches `trackTelemetry()`.                     |
| **Idempotency / concurrency races**  | `BUG-chat-swipe-index-race`, `BUG-register-non-atomic`, idempotency user-scope `c1cd4d8b`, `BUG-idempotency-table-backend`                                                                | Watchdog stress-runs the failing endpoint; agent patches the shared `idempotency.ts` once (root cause) instead of every caller.          |
| **Size-strict debt regrowing**       | `TASK-size-strict-debt` closed 2026-08-12, regressed by Sep-2026 growth; `TASK-promote-size-check-to-ci` open                                                                             | Watchdog blocks PRs that re-grow offenders; agent opens a `TASK-split-*` ticket automatically when threshold breached.                   |
| **Plan-sync orphan creation**        | `BUG-plan-sync-fix-mass-creates-orphan-git-issues-for-placeholder`, `TASK-unified` (placeholder)                                                                                         | Watchdog runs `bun run plan:validate` on a cron; agent closes placeholder tickets; no more orphan issues.                                |
| **Stale playwright config**          | `playwright.config.ts` is dead config; `bun test` runner never reads it; hundreds of fixed `page.waitForTimeout` sleeps                                                                  | Watchdog detects flake rate > N% in nightly run; agent opens migration ticket + applies web-first polling.                              |
| **Coverage below-floor modules**     | `TASK-license-compliance-gate` done but per-module coverage floor (80%) still has offenders; waiver tickets accumulating                                                                 | Watchdog emits a coverage report on every commit; agent opens per-module lift tickets and auto-files them.                              |

These are **exactly the bug classes a watchdog + agent loop is good at**: detect -> diagnose -> patch -> verify -> merge. Every one of them currently requires a human (or a separate agent session) to open the ticket, write the patch, run `bun run check`, and merge. The epic compresses that to a **closed loop**.

## Core Problems

### 1. No supervisor in the loop

`src/server/start.ts` registers `SIGTERM/SIGINT/SIGHUP/uncaughtException/unhandledRejection` and exits. There is no watchdog. If the server crashes, **nothing restarts it**; the user (or `deploy/Caddyfile` + `deploy/docker-compose.yml`) is expected to. `deploy/docker-compose.yml` already has `restart: unless-stopped` (verified 2026-09-27) but the **bare-metal / local-dev** path is unsupervised: a `bun run dev` session ends with a stack trace and a dead terminal.

Symptoms today:
- `uncaughtException` -> process exits -> `bun run dev` shell dies -> human restarts.
- Crash telemetry is logged to stdout/DB but **no agent is listening**.
- Restart-required config changes (per `REQUIRES_RESTART_KEYS`) require a human to `Ctrl-C` + restart.

### 2. No programmatic surface for an agent

`loop-lore` has a rich REST + SSE surface for the chat product. It has **no surface** for an authorized agent to:
- spawn a worktree on a live instance,
- write a patch and have it applied,
- run `bun run check` programmatically and stream the report,
- merge a ticket (`giwt finalize`) without an interactive terminal,
- close a ticket / open a new one.

The closest existing capability is `giwt commit-wt`/`giwt finalize`, both of which require a TTY (GPG signing pinentry). An agent on a remote machine has neither.

### 3. CI/CD is a one-shot pipeline, not a loop

`.github/workflows/{ci.yml,release.yml,deploy.yml}` are push/PR-triggered. There is:
- no **continuous** smoke gate (every minute, every commit hash),
- no **nightly** heavy gate (the full `bun run check` + e2e + browser + perf-regression),
- no **watchdog-driven** gate (post-crash verification),
- no **pre-merge** smoke gate beyond the existing `pr-checks.yml`.

The existing `dev-release.yml` workflow runs on push to `dev`; it is not a continuous loop.

### 4. Plan-tooling is partially agentic

`giwt` already drives a lot of agent-side workflow (worktree, ticket, finalize, sync, abort). It is **TTY-bound** (GPG signing) and **CLI-only**. A remote agent can call `giwt` over `ssh` only if it has a TTY-forwarding chain. The epic makes `giwt`-equivalent operations available over HTTP for authorized agents.

## Design

### Part A — Watchdog (in-repo process supervisor)

The watchdog is a separate process that spawns and supervises the loop-lore server. It runs `bun run server` (or `bun run dev`) as a child process, captures stdio, polls health, and restarts on crash with exponential backoff. State transitions are persisted to a `watchdog_events` table for post-mortem and an admin surface.

Key modules (new):
- `src/server/watchdog/supervisor.ts` — process spawn, stdio capture, restart loop.
- `src/server/watchdog/health-probe.ts` — HTTP probe against `GET /health` (new).
- `src/server/watchdog/state.ts` — state machine + restart policy.
- `src/server/watchdog/events.ts` — sink to `watchdog_events` table + logger.
- `src/server/watchdog/cli.ts` — `bun run watchdog` entrypoint.
- `src/server/health.ts` — `/health` (liveness) + `/ready` (readiness) handlers.

Design constraints (verified against `src/server/start.ts:32-247`):
- **No double-init**: when running under watchdog, `start.ts` does NOT register `uncaughtException` -> `shutdown` -> `process.exit(0)` (the supervisor owns the lifecycle). A new env var `LOOP_LORE_WATCHDOG=1` flips that branch.
- **No GPG blocking**: the watchdog does **not** sign on behalf of agents — signing stays agent-side (see Part B).
- **No secrets on disk**: watchdog tokens live in `~/.omp/agent/managed-skills` (existing path) or `LOOP_LORE_WATCHDOG_TOKEN` env var.

### Part B — Agent Development Loop

The agent API exposes `giwt`-equivalent operations over HTTP for authorized agents. The flow is: agent submits a task, server spawns a worktree, agent writes a patch, server runs gates and streams progress, agent commits (GPG delegated), agent finalizes.

Key modules (new):
- `src/agent/api/router.ts` — Elysia router for `/api/v1/agent/*`.
- `src/agent/api/auth.ts` — token scope check (`agent:worktree`, `agent:check`, `agent:commit`, `agent:finalize`).
- `src/agent/api/worktree.ts` — calls `giwt new` via subprocess (or directly via `scripts/worktree/index.mjs` — TTY-free path).
- `src/agent/api/check.ts` — invokes `bun run check --gates <csv>`; streams progress over SSE.
- `src/agent/api/commit.ts` — invokes `giwt commit-wt`; GPG signing delegated to agent-side `giwt gpg-unlock`.
- `src/agent/api/finalize.ts` — invokes `giwt finalize`; abort handling per `giwt abort --dry-run` semantics.
- `src/agent/api/sandbox.ts` — limits: max concurrent worktrees, max disk per worktree, max patch size.

**Constraint (per `AGENTS.md` GPG section):** preserve agent-side signing. NEVER store passphrase on server. Signing stays agent-side via `giwt gpg-unlock`.

### Part C — CI/CD Loop Tightening

- **Smoke gate** — `bun run smoke` (new script): typecheck + lint + md-lint + 1 representative e2e. Target <=60s wall-clock.
- **Heavy gate** — existing `bun run check` + e2e + browser + perf-regression. Runs nightly on cron + on PR.
- **Watchdog gate** — new: when watchdog detects 3+ failures in 60s, run heavy gate against `dev` HEAD and emit a structured alert.
- **Pre-merge gate** — existing `pr-checks.yml` + size-strict (promote from `TASK-promote-size-check-to-ci`).

Reference: existing `tests/benchmarks/` + `scripts/run-benchmarks.ts` (perf-regression already wired by `epic-benchmark-ci-regression.md`).

### Part D — Sandbox & Safety

Per the user's global-target clause, the agent API MUST be sandboxed:

- **Auth** — scoped agent tokens, never long-lived admin tokens. Token rotation via `src/crypto/`.
- **Rate limit** — per-token and global; reuse `src/middleware/rate-limit.ts`.
- **Worktree isolation** — agent worktrees live under `tree/agent-<uuid>/`; cleanup job runs on finalize or 24h idle.
- **Patch size cap** — diff <= N KB per task; multi-file patches require explicit list.
- **No secrets in patches** — pre-commit hook scans patches for `.credentials.env`, `*.pem`, AWS keys, GitHub PATs.
- **No destructive ops without `confirm: true`**.
- **Audit trail** — every agent action logged to `agent_actions` table.

## Features

### Watchdog
- [ ] Process supervisor (`src/server/watchdog/supervisor.ts`) — spawn, monitor, restart with backoff
- [ ] Health/liveness/readiness probes (`src/server/health.ts` — `/health`, `/ready`)
- [ ] State machine (starting -> healthy -> degraded -> crashed -> stopping)
- [ ] Crash telemetry persistence (`watchdog_events` table)
- [ ] Admin surface (`GET /api/admin/watchdog`)
- [ ] `bun run watchdog` CLI entrypoint
- [ ] `deploy/docker-compose.yml` `restart: unless-stopped` already wired (verified 2026-09-27)

### Agent Development Loop
- [ ] `POST /api/v1/agent/tasks` — submit a task (patch, check, commit, finalize)
- [ ] `POST /api/v1/agent/worktrees` — spawn a worktree (TTY-free path via `scripts/worktree/`)
- [ ] `POST /api/v1/agent/check` — run gates; stream progress over SSE
- [ ] `POST /api/v1/agent/commit` — GPG-signed commit (delegated to agent)
- [ ] `POST /api/v1/agent/finalize` — `giwt finalize` (PTY-bound)
- [ ] Token scope check (`src/agent/api/auth.ts`)
- [ ] Sandbox (`src/agent/api/sandbox.ts`)
- [ ] Audit trail (`agent_actions` table)

### CI/CD Loop
- [ ] `bun run smoke` script — fast gate (target <=60s)
- [ ] `.github/workflows/smoke.yml` — every commit to `dev`/PR; 60s timeout
- [ ] `.github/workflows/nightly.yml` — full `bun run check` + e2e + browser + perf-regression
- [ ] `.github/workflows/watchdog-gate.yml` — triggered by webhook from the watchdog on threshold breach
- [ ] Promote `size:strict` to blocking (lands `TASK-promote-size-check-to-ci`)

### Observability
- [ ] Watchdog events -> existing `src/telemetry/` + new `watchdog_events` table
- [ ] Agent actions -> existing `src/notifications/` + new `agent_actions` table
- [ ] Health probe -> existing `src/admin/provider-health.ts` (extend)

### Documentation
- [ ] `docs/ops/watchdog.md` — operations runbook
- [ ] `docs/ops/agent-api.md` — API reference + auth model
- [ ] `docs/ops/ci-cd-loop.md` — gate matrix + failure handling

## Tasks (12)

| # | Ticket | Scope | Effort | Dependencies |
| - | ------ | ----- | ------ | ------------ |
| 1 | `TASK-rsi-watchdog-supervisor` | supervisor process + restart loop | High | — |
| 2 | `TASK-rsi-watchdog-state-machine` | state machine + restart policy | Medium | #1 |
| 3 | `TASK-rsi-health-probes` | `/health`, `/ready` handlers | Low | — |
| 4 | `TASK-rsi-watchdog-events-table` | `watchdog_events` Kysely migration + telemetry sink | Medium | #1 |
| 5 | `TASK-rsi-agent-api-router` | `/api/v1/agent/*` router + auth scope | High | #3 |
| 6 | `TASK-rsi-agent-worktree-spawn` | TTY-free `giwt new` path + sandbox | High | #5 |
| 7 | `TASK-rsi-agent-check-stream` | `bun run check` over SSE | Medium | #5, #6 |
| 8 | `TASK-rsi-agent-commit-finalize` | GPG-delegated `giwt commit-wt` + `giwt finalize` | High | #6 |
| 9 | `TASK-rsi-agent-actions-audit` | `agent_actions` table + audit surface | Medium | #5 |
| 10 | `TASK-rsi-smoke-gate` | `bun run smoke` + `.github/workflows/smoke.yml` | Medium | — |
| 11 | `TASK-rsi-nightly-heavy-gate` | `.github/workflows/nightly.yml` + perf-regression wiring | Medium | #10 |
| 12 | `TASK-rsi-watchdog-gate-trigger` | watchdog -> heavy-gate webhook | Medium | #1, #11 |

## Files

- `src/server/watchdog/{supervisor,state,events,health-probe,cli}.ts` — new
- `src/server/health.ts` — new
- `src/agent/api/{router,auth,worktree,check,commit,finalize,sandbox}.ts` — new
- `src/db/migrations/NNN_rsi_watchdog_events.ts` — new (append-only; next sequential number)
- `src/db/migrations/NNN_rsi_agent_actions.ts` — new (append-only; next sequential number)
- `scripts/smoke.ts` — new
- `.github/workflows/{smoke,nightly,watchdog-gate}.yml` — new
- `docs/ops/{watchdog,agent-api,ci-cd-loop}.md` — new
- `deploy/docker-compose.yml` — extend with watchdog profile

## Cross-references

- **Parent epic:** none (this is a new infrastructure epic).
- **Siblings:**
  - `epic-resource-provision.md` — provisions **external** compute/credentials; this epic covers the **internal** watchdog + agent loop.
  - `epic-testing-qa.md` — supplies failure modes that the watchdog catches.
  - `epic-code-quality.md` — supplies size-strict + lint gates that the smoke gate promotes.
  - `epic-benchmark-ci-regression.md` — supplies the perf-regression gate that the nightly gate runs.
  - `epic-release-010.md` — release process; the watchdog gate + finalize hook into it.
  - `epic-api-versioning.md` — `/api/v1/agent/*` lives under the same `/api/v1` prefix.
  - `epic-security-sandboxing.md` — sandbox model reuses its primitives.
  - `epic-api-rate-limiting.md` — agent API rate-limited by token.
- **Tickets to merge into this epic on completion:** `TASK-promote-size-check-to-ci`, `BUG-alpine-init-hydration`, `BUG-plan-sync-fix-mass-creates-orphan-git-issues-for-placeholder`.

## Open Questions

1. **Agent API auth model** — scoped tokens vs. OAuth-style bearer? Recommend scoped tokens (admin-issued), 24h TTL.
2. **Sandbox boundary** — `tree/agent-<uuid>/` (recommended) vs. ephemeral git worktree outside the repo?
3. **Smoke gate budget** — 60s wall-clock on `ubuntu-latest` cold runner is tight; might need 90s. Verify with first run.
4. **Watchdog gate trigger** — webhook from watchdog -> `.github/workflows/watchdog-gate.yml` (uses `repository_dispatch` event).
5. **Multi-instance watchdog** — defer to P6+ unless federation lands first.
6. **External agent SDK** — recommend TS-first (matches repo), Python second, Go later.

## References

- External patterns surveyed (2026-09-27):
  - **OpenClaw** — agentic desktop pet; supervisor + watchdog pattern
  - **Hermes Agent** (Nous Research) — agent harness + sandboxing
  - **OpenCode** (sst/opencode) — TUI coding agent + worktree management
  - **omp** (this project's harness) — `giwt`, `omp`, agent-side tooling
  - **GitHub Copilot Coding Agent**, **Devin**, **Claude Code** — closed-loop coding agents
- Internal:
  - `AGENTS.md` GPG signing — preserve agent-side signing constraint
  - `src/server/start.ts:32-247` — server lifecycle; new watchdog hooks in here
  - `.github/workflows/{ci,release,deploy}.yml` — existing CI surface to extend
  - `scripts/check-parallel.mjs` — gate runner; new smoke + watchdog gates extend it
  - `deploy/docker-compose.yml` — `restart: unless-stopped` already wired
  - `src/middleware/rate-limit.ts` — reuse for agent API rate limit
  - `src/crypto/` — token generation + rotation
  - `src/notifications/` — webhook delivery for watchdog alerts
  - `src/admin/provider-health.ts` — extend for watchdog health surface
