<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Actors — API Routes (actor + child-table REST surface)

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-actors
**Summary:** REST routes for actor CRUD + every child-table operation: `actors`, `actor_memories`, `actor_notes`, `actor_lore_entries`, `actor_items`, `world_lore_entries`. Each route is auth-gated and validated through the existing Elysia `t` schema layer.
**Context:** gap-audit 2026-09-25 of `epic-actors` found `src/routes/actors.ts` is a placeholder; runtime services exist but are not wired to HTTP. Reuse existing middleware unchanged.
**Acceptance Criteria:** All routes return 2xx on success, 401/403 on auth failure, 400 on validation rejection, 404 on missing row; lore match endpoint caps response to caller-specified token budget (default 500); item transfer is atomic (single transaction, no orphans on partial failure); no regression to existing route-table mounting; `bun run check` green.

## Summary

REST routes for actor CRUD and every child-table operation: `actors`, `actor_memories`, `actor_notes`, `actor_lore_entries`, `actor_items`, `world_lore_entries`. Each route is auth-gated, validated through the existing Elysia `t` schema layer, and returns the typed response envelope.

## Background

The spec calls for an actor CRUD API plus per-child-table routes. Today `src/routes/actors.ts` is a placeholder; the runtime services (`src/characters/service/actor-*.ts`) exist but are not wired to HTTP. Elysia auth and validation middleware (already in `src/middleware/` and `src/validation/`) are reused unchanged.

## Scope

- `src/routes/actors.ts` — list/get/create/update/delete for the `actors` table; mount on `/api/actors`.
- `src/routes/actor-memories.ts` — CRUD + promote/demote endpoints; mount on `/api/actors/:actorId/memories`.
- `src/routes/actor-notes.ts` — CRUD + category filter; mount on `/api/actors/:actorId/notes`.
- `src/routes/actor-lore.ts` — CRUD + match endpoint (POST `/api/actors/:actorId/lore/match` taking chat context, returns ranked entries).
- `src/routes/actor-items.ts` — CRUD + attach/transfer; mount on `/api/actors/:actorId/items`.
- `src/routes/world-lore.ts` — CRUD for `world_lore_entries`; mount on `/api/worlds/:worldId/lore`.
- Validation: each route uses the existing `src/validation/schemas.ts` `t` schema pattern (no greenfield validators).
- Tests: per-route happy path + auth failure + validation rejection.

## Acceptance Criteria

- [ ] All routes return 2xx on success, 401/403 on auth failure, 400 on validation rejection, 404 on missing row.
- [ ] Lore match endpoint caps response to caller-specified token budget; default 500.
- [ ] Item transfer is atomic (single transaction): no orphan rows on partial failure.
- [ ] No regression to existing route-table mounting.
- [ ] `bun run check` green.

## Linked Tickets

- Companion tickets (this epic): `TASK-actors-data-versioning.md`, `TASK-actors-child-tables-crud.md`, `TASK-actors-import-export.md`.
- Related: `src/routes/` mounting index, `src/validation/schemas.ts` schema conventions.


git issue: f86deef
