<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

## Dead / unwired code

| #  | Item                                                                                                                                                              | Where                                                          | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1  | Transport WebSocket stack unwired (adapters are no-op stubs; no WS server)                                                                                         | `src/transport/`                                               | 🟡 WIRE → `TASK-transport-server-wiring`: measured 2026-09-26 — only 2 of the ~9 files are imported by production code (`peer-table.ts` by `src/federation/gossip.ts`, `negotiation-parsers.ts` by `src/middleware/dynamic-response.ts`); the `factory`/`upgrade`/`negotiation`/`compression`/`protocol.unified` chain is reachable only from itself + tests. Server serves via Bun native HTTP/1.1+TLS (`src/server/start.ts`). Keep, revisit when real-time chat ships |
| 2  | Music/SFX/Video generation stubs (no provider)                                                                                                                    | `src/assistant/commands/`                                      | 🟡 Implement provider or disable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

## Migration hygiene — see § Closed clusters moved off

> The append-only policy is documented in `src/db/migrations/README.md`; the loader is
> `getMigrationFiles()` in `src/db/migrate.ts`. No open hygiene items: the duplicate-prefix
> gate asked for by the 2026-08-25 audit landed in `scripts/check-migration-ordering.ts`
> (fails on duplicate numeric prefixes) and runs as the `migrations - ordering` check gate.

## Release hardening (mirrors `../priority-release-010.md`; kept here for the open queue)

- ✅ **Lint-ts debt** → closed 2026-08-14 (worktree `lint-ts-debt`).
- 🟡 **Size-strict debt** → closed 2026-08-12, **since regressed by growth**; must be back under the ceiling before the tag. Open tickets: `TASK-size-strict-debt`, `TASK-frontend-size-gate`, `TASK-promote-size-check-to-ci`.
- ✅ **e2e browser stabilization** → closed 2026-08-14 (worktree `e2e-stabilization`).
- 🟡 release-process + tag `v0.1.0` + changelog + push `dev`→`origin/dev` → `TASK-PLAN-RELEASE-V010` + `epic-release-010.md`. Tagging and pushing are human-only.

## Closed clusters moved off (2026-09-26 prune)

- **Post-bug-bucket refactoring (2026-09-03)** — all 5 rows resolved (`scopeByUserId`, crafting `world_id` helper, typed Kysely upsert-by-unique helpers, Alpine store field validation, trust-boundary audit pass) — `open-closed.md` § Retired 2026-09-18.
- **Audit follow-up cluster (Bucket A/B/C, 2026-09-03)** — 8 tickets resolved 2026-09-10 (`audit-followups-2026-09-10`) — `open-closed.md` § Retired 2026-09-18.
- **Schema drift / latent bugs** — all 8 rows closed (migrations 035 tables/index, `migrateChat` parent remap, chat-search schema key, `chat.html` partial, `.zst` guard, age-gate error leak, telemetry `chatId`) — evidence in the ticket `## Resolution` blocks.
- **Migration hygiene** — the `migrations/parts/` era is over: the tree is a single top-level `NNN_*.ts` series auto-discovered by `getMigrationFiles()`, and the append-only policy (never combine applied migrations; the filename is the `kysely_migration` identity) is documented in `src/db/migrations/README.md` and enforced by `assertMigrationsNotStale`.
- **2026-09-10 debt paydown** (NSFW structural, test health, coverage floors, mesh size-gate splits, P6-I plugin loader/registry/config-merge/event-bus/mount-points/tool-executor suites) — landed; see `open-closed.md`. Residual: bundled shipped-plugin sources are only covered via the loader e2e boot path (coverage-waiver tracking).

**Still open:** transport module + music/SFX/Video stubs (above), the size-strict ceiling, and the `0.1.0` tag/push (human-only).
