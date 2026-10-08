<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Allow DATA_DIR to be overridden by env var

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-local-multi-instance-federation

**Summary:** Make `DATA_DIR` overridable by env var so two local instances can point at separate state directories.

**Context:**

`DATA_DIR` (`src/config/constants.ts:13`) is a bare `path.resolve(__dirname, "..", "..", "loop-lore-data")` with no env read. Every path-bearing default derives from it: `database.sqliteFilename` (`src/config/sections/database.ts:11`), `assets.uploadDir` (`src/config/sections/assets.ts:10`), and `server.tls.key` / `.cert` (`src/config/sections/server.ts:16-19`). Two instances on one machine therefore cannot get distinct state — and the TLS paths have no override at all, so a second TLS-enabled instance is impossible today.

The constraint that shapes this: the published JSON Schema rewrites resolved `DATA_DIR`-anchored defaults back to `${DATA_DIR}` placeholders (`src/config/schema-class/json-schema/index.ts:35-47`) so the schema stays stable across machines. Section Meta must therefore keep carrying a **resolved absolute path** as the default while the schema output stays portable. Do not "fix" this by making the Meta default a placeholder — that breaks every consumer that joins against the constant.

**Direction:**

1. In `src/config/constants.ts`, read an env override with the current `path.resolve` expression as the fallback.
2. Name the variable `DATA_DIR` to match the constant it overrides. Confirm it is not already claimed by another tool in the runtime before adopting it.
3. Keep the resolved value absolute (`path.resolve` the override too) so downstream `path.join` calls are unaffected.
4. Verify the placeholder rewrite still matches: `toPlaceholders` prefix-matches on `DATA_DIR`, so a relocated root must still rewrite cleanly.
5. Tests: env set → `database.sqliteFilename`, `assets.uploadDir`, and `server.tls` all land under the new root; env unset → identical to today's resolved paths.

**Acceptance Criteria:**

- [ ] With `DATA_DIR` set, `database.sqliteFilename`, `assets.uploadDir`, and `server.tls.key`/`.cert` all resolve under the new root
- [ ] With `DATA_DIR` unset, all four defaults are identical to their current values
- [ ] The published JSON Schema still emits `${DATA_DIR}` placeholders rather than a machine-specific absolute path
- [ ] The override is documented in the schema description and in the local dev runbook
- [ ] Config default tests cover both the set and unset cases; `bun run check` green

**Dependencies:**

- None — this is the prerequisite the harness and the e2e both consume, not a consumer of either. Two instances cannot have separate state roots until this lands, so neither of those tickets can be implemented first.

**Related Tickets:**

- `TASK-add-a-two-instance-local-federation-dev-harness-and-runbook.md` — consumes this; the harness needs per-instance state roots. Downstream of this ticket, one-way.
- `TASK-add-a-federation-e2e-test-that-boots-two-real-servers.md` — consumes this; the e2e needs two separate DBs. Downstream of this ticket, one-way.

**Out of Scope:**

- A general env-prefix mechanism (e.g. `LL_FEDERATION_ENABLED`) — see review §3 blocker 3
- Relocating `DATA_DIR` out of `src/config/constants.ts` into the loader
