<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Actors — Child Tables CRUD (memories / notes / lore / items)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-actors
**Summary:** CRUD + lifecycle hooks for the actor child tables (`actor_memories`, `actor_notes`, `actor_lore_entries`, `actor_items`) plus world-scoped `world_lore_entries`. Each gets a service module, typed contract, lifecycle hooks (memory after-response + cron-sweep), and tests.
**Context:** gap-audit 2026-09-25 of `epic-actors` found a 1-line stub `TASK-actors.md` with no Acceptance Criteria. Runtime services need typed CRUD + memory promotion/demotion + lore keyword matching to support `TASK-actors-api-routes`.
**Acceptance Criteria:** All five child tables have a service module exporting create/read/update/delete + actor-scoped queries; memory `promote`/`demote` updates `confidence` + `importance` and `expires_at`; cron sweep uses the existing scheduler (integration test asserts deletion of seeded-expired memory); lore match returns entries ordered by priority capped to caller-specified token budget; item transfer preserves `created_at` and bumps owning actor's version; existing actor tests still pass; `bun run check` green.

## Summary

CRUD + lifecycle hooks for the actor child tables — `actor_memories`, `actor_notes`, `actor_lore_entries`, `actor_items` — plus the world-scope `world_lore_entries`. Each gets a service module, a typed contract, lifecycle hooks (memory after-response and cron-sweep), and tests.

## Background

The `actors` table holds the unified participant model; child tables attach subordinate content. Memories are promotion-based organic facts that the LLM pipeline and cron sweeps promote/demote. Notes are user-authored reference material with category tags. Lore is keyword-triggered knowledge. Items are equipment/possessions/quest items.

## Scope

- `src/characters/service/actor-memories.ts` (new) — CRUD + `promoteMemory`, `demoteMemory`, lifecycle hooks (`afterLLMResponse`, `cronSweep`).
- `src/characters/service/actor-notes.ts` (new) — CRUD + category tag filter.
- `src/characters/service/actor-lore.ts` (new) — CRUD + `matchLoreEntries(actorId, chatContext)` for keyword matching.
- `src/characters/service/actor-items.ts` (new) — CRUD + `attachToActor`, `transferBetweenActors`.
- `src/characters/service/world-lore.ts` (new) — CRUD for `world_lore_entries` (global lore not tied to one character).
- `src/characters/service/memory-lifecycle.ts` (new) — shared cron sweep + post-response promotion gate (pipeline-capacity check).
- `src/db/seed-helpers/` — typed insert helpers (or extend `src/test-utils/insert-helpers.ts`).
- Unit + integration tests covering each CRUD path + the memory-lifecycle cron sweep.

## Acceptance Criteria

- [ ] All five child tables have a service module exporting create/read/update/delete + actor-scoped queries.
- [ ] Memory `promote`/`demote` triggers update `confidence` + `importance` and the `expires_at` field.
- [ ] Cron sweep uses the existing cron scheduler; integration test seeds an expired memory and asserts deletion.
- [ ] Lore matching returns entries ordered by priority, capped to the token budget the caller passes.
- [ ] Items transfer preserves the `created_at` provenance and bumps the owning actor's version (companion `TASK-actors-data-versioning`).
- [ ] All existing actor tests still pass.
- [ ] `bun run check` green.

## Linked Tickets

- Companion tickets (this epic): `TASK-actors-data-versioning.md`, `TASK-actors-api-routes.md`, `TASK-actors-import-export.md`.
- Related: `epic-character-core-system.md` (character spec authoring), `epic-gm-shadow-notes.md` (notes extension).


git issue: c62dfff
