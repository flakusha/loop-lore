# FEAT: Character World Setup Bundle (Per-World Overlay)

**Epic:** epic-character-world-setup
**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Tags:** characters, worlds, setup, inventory, lore, backstory, overlay

## Summary

Introduce the `character_world_setup` table + service so a character can carry
world-specific setup — starting inventory, world-scoped lore, backstory-in-world-
context, and scenario/system-prompt overrides — without touching the base
`actors` setup. Ship the schema, CRUD service, resolution helper, and seed hook.

## Background

A character's base setup lives on `actors` (description, personality, scenario,
system_prompt, welcome_message, …). World-scoped state is currently fragmented:
`character_world_traits` (traits), `npc_states` (health/knowledge/schedule),
`world_items.owner_actor_id` (current inventory), `world_avatar_config`
(avatars). Nothing captures the world-specific **setup bundle** (starting gear,
world lore, world backstory, prompt overrides) as a single authoritative
per-`(actor, world)` record.

## Work

1. **Migration `042_character_world_setup.ts`** — `character_world_setup` table
   (columns per epic data model), `UNIQUE(actor_id, world_id)`, indexes on
   `actor_id` and `world_id`.
2. **Regenerate** — `bun run db:sync-types && bun run db:sync-manifest`
   (schema, manifest, insert-helpers, and db-schemas validation).
3. **Service `src/characters/world-setup/`** —
   - `types.ts` — `CharacterWorldSetup`, `WorldSetupInventoryItem`,
     `WorldSetupLoreEntry`, `CreateWorldSetupInput`, `UpdateWorldSetupInput`,
     `ResolvedCharacterWorldSetup`.
   - `crud.ts` — `upsertWorldSetup` (idempotent), `getWorldSetup`,
     `updateWorldSetup`, `deleteWorldSetup`.
   - `resolve.ts` — `resolveCharacterWorldSetup` (merge base actor + world setup;
     non-null overrides win; starting inventory reported separately from
     current).
   - `index.ts` — `CharacterWorldSetupService` class.
4. **Seed hook** — `src/story/world-state/init.ts`: add
   `initializeCharacterWorldSetup` that inserts an empty setup row per
   `(actor, world)` (idempotent, mirrors `initializeNpcStates`).
5. **Tests** — CRUD round-trip, idempotent upsert, resolution precedence,
   seed idempotency.

## Acceptance Criteria

- [ ] `character_world_setup` migration applies cleanly; schema regenerated
- [ ] `CharacterWorldSetupService` CRUD + resolution unit-tested green
- [ ] `initializeCharacterWorldSetup` idempotent (no dup rows on re-run)
- [ ] `bun test src/` green; `bun run check` green (incl. `db:schemas:check`)
- [ ] No edits to base `actors` setup semantics

## Files

- `src/db/migrations/042_character_world_setup.ts`
- `src/db/schema-character.ts` (generated)
- `src/characters/world-setup/{types,crud,resolve,index}.ts`
- `src/story/world-state/init.ts`
- `src/test-utils/insert-helpers.ts` (generated)

## Related

- `TASK-character-world-data-separation.md` — parent 4-layer model
- `TASK-link-npc-inventory.md` — current inventory lives in `world_items`
- `TASK-world-item-instance-npc.md` — item placement onto NPCs
