<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Logging & Structured Logging

**Tags:** logging, telemetry, observability, jsonl, redaction, infrastructure
**Overview:** (see sections below)


**Status:** In Progress
**Status Note:** the logging platform itself is built and shipped — `src/logger/` is complete, the six-level set is live end-to-end, `/api/telemetry` exists, and `log_entries` is indexed and queryable. What this epic still owns is narrower: (1) `getLogger` is not yet the only entry point — `console.*` survives in 21 non-test files under `src/` (58 call sites) with no `no-console` lint rule enabled; (2) the ad-hoc log query surface was specced against a JSONL file whose presence is deployment-dependent, and must be reframed against the real `log_entries` table; (3) the OTLP sink is specced but has zero code. Trace/fatal and canonical-JSONL are NOT this epic's scope — `epic-logging-telemetry.md` owns them and its status note records all four of its tickets as merged (2026-08-07).
**Priority:** Medium
**Effort:** Medium
**Type:** Infrastructure

## Summary

Close out the remaining gaps on the structured-logging surface so `getLogger` really is the
only way this codebase emits logs, and so "query my logs" means querying an artifact that
exists. The prior revision of this epic claimed the level set, the telemetry routes, and the
`log_entries` table were pending; they are not — see `## Already Shipped`. Only the console
migration, the query-surface reframing, and the OTLP sink remain genuinely unshipped.

## Already Shipped

Do not re-plan any of this. Verified against the source tree:

| Area              | Evidence |
| ----------------- | -------- |
| Logger module     | `src/logger/index.ts` (`createLogger`, `getLogger`, `setGlobalLogger`), `types.ts`, `levels.ts`, `queue.ts` (`AsyncLogQueue` — batch 100 ms / 50 entries, max 10k), `censors.ts` (`DEFAULT_RULES`, `censorValue`, `censorObject`), `limits.ts`, `formatters.ts` (`formatConsole`, `formatJSONL`), `logger.ts` (`LoggerImpl`) |
| Six-level set     | `LogLevelNumeric` maps `trace: 5`, `debug: 10`, `info: 20`, `warn: 30`, `error: 40`, `fatal: 50` (`src/logger/types.ts:11-18`); the `Logger` interface declares `trace()` and `fatal()`; `levels.ts` handles all six via `levelFromConfig` / `numericToLabel` |
| Transports        | `src/logger/transports/console.ts`, `db.ts` (`DBTransport` → `log_entries`), `file.ts` (`FileTransport`, canonical JSONL) |
| Telemetry routes  | `src/routes/telemetry.ts` — `POST /api/telemetry/event` plus admin-only `GET /api/telemetry/analytics/{summary,models,errors,daily}` and `DELETE /api/telemetry/analytics/purge`; also `src/routes/admin/aux-telemetry.ts` and the `src/routes/analytics/` route group (`overview.ts`, `chats.ts`, `characters.ts`) |
| Log storage       | `log_entries` table in `src/db/schema-core.ts`, created by `src/db/migrations/001_init.ts`, indexed on entity, (event, time), and (user, time) |
| Audit surface     | `src/routes/admin/audit.ts` serves paged audit rows; audit rows are written by moderation, NSFW gate, ownership transfer, and GC purge paths |
| Telemetry service | `src/telemetry/` — `service.ts`, `config.ts`, `cleanup.ts` |

**Spec drift to be aware of:** `docs/spec/logging.md` still documents four levels (DEBUG 10 /
INFO 20 / WARN 30 / ERROR 40) and never mentions `trace` or `fatal`. The code is ahead of the
spec here. See `## Open Questions` — either the spec table moves to six or the code drops two
levels; it cannot stay split.

## Remaining Scope

### 1. `console.*` → `getLogger` (unstarted)

ESLint has **no `no-console` rule enabled repo-wide**. The rule is explicitly turned *off* for
`src/frontend/**` (`eslint.config.mjs:301`) and never turned *on* anywhere, so nothing enforces
the "only entry point" rule today.

Console call sites that must be migrated, worst offenders first. Census excludes `*.test.*`
files, comments, and doc-comment examples:

| File                                              | `console.*` calls |
| ------------------------------------------------- | ----------------- |
| `src/scripts/migrate-character-legacy.ts`         | 9                 |
| `src/scripts/commit-check.ts`                     | 8                 |
| `src/scripts/version-bump.ts`                     | 7                 |
| `src/frontend/alpine/logger.ts`                   | 5                 |
| `src/scripts/backfill-users-encryption-secret.ts` | 4                 |
| `src/scripts/smoke-app.ts`                        | 4                 |
| `src/frontend/character-growth-editor.ts`         | 4                 |
| `src/frontend/alpine/transports/console.ts`       | 4                 |
| 13 further non-test files                         | 1 each            |

Plan: enable `no-console` repo-wide with an explicit allowlist for `src/scripts/**` and
`src/frontend/**` (both legitimately write human-facing CLI output with no request context to
bind), then migrate the script call sites onto `getLogger` where a module name is meaningful.

Note `src/frontend/alpine/logger.ts`, `src/frontend/alpine/transports/console.ts`, and
`src/frontend/alpine/queue.ts` are the frontend logger itself — their `console.*` uses are the
sink, not a violation, and belong in the allowlist rather than in the migration.

### 2. Ad-hoc log query surface — reframe, do not re-spec

The prior acceptance criterion invented `bun run telemetry:query <field>=<value>` filtering
`/var/log/loop-lore/*.jsonl`, with a "sub-second on 1GB logs" budget. **The command does not
exist** — there is no `telemetry:query` script in `package.json`, and no such endpoint.

The directory, however, is real — the epic just mislocated it. `/var/log/loop-lore/` is the
**bare-metal deployment** convention, not a code default: `docs/ops/bare-metal-deploy.md` names
`/var/log/loop-lore/app.jsonl` as the canonical JSONL target, and the systemd units grant it via
`ReadWritePaths=/data/loop-lore /var/log/loop-lore` (`docs/ops/bare-metal/systemd/loop-lore.service`,
`loop-lore-worker.service`). The path is driven by the `logging.jsonlPath` config key
(`src/config/sections/logging.ts`, consumed at `src/logger/logger.ts:71` to mount `FileTransport`)
— which is unset by default, so a default deployment writes no JSONL at all.

Reframe: the artifact that is queryable *everywhere*, with no deployment coupling, is the
indexed `log_entries` table. The honest scope is a thin read-only query command over
`log_entries` (entity / event / user / level / time-range filters), reusing the existing indexes
rather than scanning a log file. Drop the 1GB timing requirement — it constrained an artifact
whose presence is deployment-dependent. See `## Open Questions` before choosing the target.

### 3. OTLP sink

Specced as an optional, default-off sink gated on `OTLP_ENDPOINT`. **There is no OTLP or
opentelemetry code anywhere in the repo** — no dependency, no transport, no config key. It is a
greenfield addition, not an integration of something half-built.

## Out of scope

- Trace / fatal levels and canonical-JSONL consolidation — owned and recorded Done by
  [`epic-logging-telemetry.md`](epic-logging-telemetry.md).
- Telemetry ingestion and analytics endpoints — shipped; owned by
  [`epic-api-telemetry.md`](epic-api-telemetry.md) and
  [`epic-analytics-observability.md`](epic-analytics-observability.md).
- Aggregation / dashboarding — owned by
  [`epic-performance-dashboard-slo.md`](epic-performance-dashboard-slo.md).
- Log rotation daemon — owned by
  [`epic-runtime-integrity-fail-safes.md`](epic-runtime-integrity-fail-safes.md).
- Redaction-list ownership — owned by
  [`epic-security-sandboxing.md`](epic-security-sandboxing.md).

## Acceptance Criteria

Already met (kept as regression guards, not pending work):

- [x] Six-level set is live end-to-end — `trace: 5` … `fatal: 50` in
      `src/logger/types.ts:11-18`, handled by `levelFromConfig` / `numericToLabel` in
      `src/logger/levels.ts`, and exposed as `Logger.trace()` / `Logger.fatal()`.
- [x] Three transports exist — `src/logger/transports/{console,db,file}.ts`.
- [x] `/api/telemetry` exists — `POST /api/telemetry/event` plus admin-only analytics + purge
      in `src/routes/telemetry.ts`.
- [x] `log_entries` exists, is indexed, and is served — `src/db/schema-core.ts`,
      `src/db/migrations/001_init.ts`, `src/routes/admin/audit.ts`.

Genuinely unshipped:

- [ ] `no-console` is enabled in `eslint.config.mjs` with an explicit allowlist for
      `src/scripts/**` and `src/frontend/**`, and running the linter flags every remaining
      `console.*` under `src/`.
- [ ] No `console.*` calls remain in non-test `src/` files outside the declared allowlist.
- [ ] The top offenders (`migrate-character-legacy.ts`, `commit-check.ts`, `version-bump.ts`,
      `alpine/logger.ts`, `backfill-users-encryption-secret.ts`, `smoke-app.ts`,
      `character-growth-editor.ts`, `alpine/transports/console.ts`) are either migrated to
      `getLogger`, allowlisted as sink code, or carry an inline justification comment.
- [ ] An ad-hoc log query command exists and reads the indexed `log_entries` table, not a
      log-file directory — filters cover at least entity, event, user, level, and time range.
- [ ] `docs/spec/logging.md` and the six-level reality agree — the level table documents
      `trace` and `fatal` (or the code drops them; the two cannot stay split).
- [ ] Tests cover redaction (including the depth cutoff), level filtering, and child-logger
      context propagation.
- [ ] OTLP sink, if built, is gated on config and default-off — no OTLP traffic unless
      explicitly enabled.

## Open Questions

1. **Does the ad-hoc query target `log_entries` or the JSONL file?** This epic assumes the DB
   table, because it is indexed and present in every deployment. The counter-argument is real:
   bare-metal deploys write `/var/log/loop-lore/app.jsonl`, so a file-scoped tool would serve
   operators who have no DB access. Decide before implementing.

   Note the config key is `logging.jsonlPath` (`src/config/sections/logging.ts`), **not** the
   `LOG_JSONL_PATH` env var that `docs/spec/logging.md:79` claims — no such env binding exists.
   `schemas/env-map.snapshot.json` binds only `LOG_LEVEL` / `LOGGING_LEVEL` to `logging.level`.
   `logging.dbEnabled` is likewise config-file-only. The spec's env list is wrong on three keys;
   fixing that table is a separate docs task, not logging scope.
2. **Six levels or four?** `docs/spec/logging.md` documents four; the code ships six. Either
   the spec table moves to six (trace 5 / fatal 50), or `trace`/`fatal` come back out of
   `LogLevelNumeric` and the `Logger` interface. The spec is the one that is behind.

## Specs

- [`docs/spec/logging.md`](../../docs/spec/logging.md) — the house spec; its level table is
  currently behind the implementation (see `## Open Questions`).

## Related Epics

- [`epic-logging-telemetry.md`](epic-logging-telemetry.md) — sibling epic; owns trace/fatal +
  canonical JSONL. Its status note records all four of its tickets as Done (merged 2026-08-07).
- [`epic-api-telemetry.md`](epic-api-telemetry.md) — telemetry ingestion + analytics routes.
- [`epic-analytics-observability.md`](epic-analytics-observability.md) — analytics consumption
  of the telemetry tables.
- [`epic-observability-telemetry.md`](epic-observability-telemetry.md) — tracing + dashboards.
- [`epic-performance-dashboard-slo.md`](epic-performance-dashboard-slo.md) — aggregation /
  dashboarding.
- [`epic-runtime-integrity-fail-safes.md`](epic-runtime-integrity-fail-safes.md) — log rotation
  daemon.
- [`epic-security-sandboxing.md`](epic-security-sandboxing.md) — redaction list.
- [`epic-nsfw-moderation-priority.md`](epic-nsfw-moderation-priority.md) — owns the NSFW-gate
  PII ticket that writes into `log_entries`.
- [`epic-code-quality.md`](epic-code-quality.md) — owns the lint gates the `no-console` change
  lands in.

## Tickets

| Ticket | Title | Bound to | Status |
| ------ | ----- | -------- | ------ |
| `BUG-access-log-never-records-userid-handle-x-user-id-header-neve.md` | Access log never records userId/handle (`x-user-id` header never set) | this epic (`**Epic:** epic-logging`) | Done |
| `BUG-logger-censor-depth-cutoff-returns-subtree-untouched-nested-.md` | Logger censor depth cutoff returns subtree untouched — nested secrets bypass denylist | no `**Epic:**` field; touches `src/logger/censors.ts` | Done |
| `BUG-nsfw-gate-log-plaintext-pii.md` | NSFW gate `logNsfwEvent` writes plaintext PII to `log_entries` | `epic-nsfw-moderation-priority` | Done |
| `BUG-admin-auxtelemetry-leaks-userid-chatid.md` | `/api/admin/telemetry/aux` returns raw `userId` / `chatId` / `error` | `epic-analytics-observability` | Done |
| `TASK-add-trace-fatal-log-levels-and-api-methods.md` | Add trace + fatal log levels and API methods | `epic-logging-telemetry` | Done |
| `TASK-logging-separate-database-research.md` | Separate database for logging — research | `epic-logging-telemetry` | Not Started |

All six are recorded rather than dropped. Five are Done and are listed so their fixes are not
re-litigated or re-implemented; `TASK-logging-separate-database-research.md` is the one still
open, and it is the same storage question the reworked query surface runs into: where
`log_entries` lives determines what a query tool has to open.
