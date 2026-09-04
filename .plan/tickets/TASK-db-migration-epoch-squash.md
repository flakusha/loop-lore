<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: db-migration-compaction (Path B — final-form, parts/-decomposed)

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** High

## Summary

Collapse 79 top-level migrations into a single orchestrated `001_init.ts` + extensive `parts/` tree, per epic-db-migration-compaction.md (Path B). Emit the completed schema as pure CREATE (no DROP, no FK on/off toggle) in Kysely `.schema` DSL so the text-parsing generators keep producing identical artifacts. Fixes two latent defects: (1) JS-injected static timestamp defaults → `(datetime('now'))`; (2) `chats.encryption_level` default `'public'` → `'none'`. Breaks existing DBs (rename = staleness) — recovery is `db:reinit` on dev + worktrees.

## Acceptance Criteria

- [ ] `001_init.ts` + `parts/` tree emit final schema (130 real tables, 2 FTS, 221 indexes, 3 triggers)
- [ ] Fresh-DB `.schema` byte-identical to normalized fresh-dump
- [ ] `db:sync-types` + `db:sync-manifest` zero diff; `schemas:check` green
- [ ] Migration-coupled tests (`migration-076`, `migration-roundtrip`, `migrations`) rewritten + green
- [ ] `bun run check` green
- [ ] Finalized via `scripts/worktree/ finalize` (GPG-signed)