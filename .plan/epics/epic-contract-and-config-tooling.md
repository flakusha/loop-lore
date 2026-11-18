<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Contract and config tooling gaps

**Overview:** (see sections below)

**Status:** Not Started
**Status Note:** Filed 2026-11-12 from RSI repo-access lane evidence (verified 2026-11-11/12 on dev + worktree)
**Priority:** Medium
**Effort:** Medium
**Type:** Tooling Epic
**Tags:** tooling, openapi, contract, config, schema, generator

## Summary

Two repo tooling generators silently fail or produce incomplete output, so the
served API contract and the config schema contract have drifted from what the
server actually exposes. This epic owns closing both gaps.

## Tickets

| Ticket | Scope | Status |
|--------|-------|--------|
| `TASK-openapi-spec-omits-harness-routes-plugin.md` | OpenAPI spec omits every `/api/v1/harness/*` endpoint (settings incl. `repoAccessEnabled`, runs, stats, metrics, ledger, stream, queue, permissions, usage, models, files) | Not Started |
| `BUG-config-schema-generators-exit-1-silently.md` | `config:generate-schema` / `config:generate-toml-schema` exit 1 with no error output | Not Started |

## T1 — OpenAPI harness-plugin coverage

- **Evidence:** `NODE_ENV=development bun scripts/generate-openapi.ts` exits 0, but `grep harness/settings` on the generated `docs/reference/openapi.json` returns 0 hits. The generator (scripts/generate-openapi.ts:65-68) already mounts `v1Routes` — whose `adminSurface` wires `harnessRoutes` (src/routes/v1/admin-surface.ts:48) — plus `registerPlugins`, yet no harness path reaches the collected spec or the VitePress API pages.
- **Fix shape (per lane proposal):** wire the harness routes plugin into the generator's spec-collection surface; route response schemas already exist (e.g. `HarnessUsageResponse` in src/routes/harness/usage.ts:41).
- **Why its own review:** touches every harness endpoint's spec surface at once.

## T2 — Config-schema generator silent failure

- **Evidence:** `bun src/config/generate-schema.ts` exits 1 with no output on dev and in any worktree; pre-existing. Static read points at the output path built as `${__dirname}/@/schemas/loop-lore-config.schema.json` (packages/core/src/config/generate-schema.ts:25) — an `@/` segment lifted from the usage comment, not a real directory — so the write fails ENOENT and `process.exit(1)` fires (line 32) while `log.fatal` never reaches the terminal.
- **Fix shape:** correct the output path or surface the failure loudly; audit the TOML-schema sibling for the same pattern.

## Definition of Done

- Generated OpenAPI spec contains every served `/api/v1/harness/*` path; VitePress API pages match.
- `bun run config:generate-schema` (and TOML sibling) exit 0 with the schema written, or fail loudly with the real error.
- `bun run plan:validate` green.


git issue: d2dd7ed
