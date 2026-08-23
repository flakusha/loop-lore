<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Scenario System — User-Facing Authoring & Catalog

**Status:** ⬜ Not Started
**Priority:** P1 — High
**Effort:** High
**Type:** Feature Task
**Tags:** scenario, authoring, creative-studio, catalog, share
**Epic:** epic-creative-studio
**Related:** TASK-assistant-scenario-source, TASK-assistant-scenario-source (generation/blog
bridge), TASK-generation-mock-scenario-provider, TASK-e2e-scenario-catalog-coverage

## Summary

loop-lore has no first-class scenario system. The only "scenario" concept is
`CharacterTemplate.scenario?: string` — a single free-text opening. AI Dungeon-class
platforms treat scenarios as reusable, shareable, cataloged starting packages (title,
description, world sketch, opening, bundled actors, tags, remixes). This task builds
user-facing scenario authoring + a catalog, distinct from the generation-side
`scenario-source` store.

## Background

Gap analysis (`.tmp/creative-content-systems-gap-analysis.md`, 2026-08-23): `src/assistant/
scenario-source.ts` was deleted 2026-08-14 as a dead stub; its design seed (`ScenarioSource`:
origin, world_sketch, reusable, tags) was recovered. `TASK-assistant-scenario-source.md`
rebuilds that as a **generation/blog bridge** (DB + service + blog world-seed). What is
missing is the **user-facing authoring + catalog** layer: authors compose scenarios in
Creative Studio, bundle worlds/characters/openings, tag, share, and remix — surfacing as
selectable starting points for new chats/stories.

## Work

1. **Scenario model:** `Scenario` entity — id, title, description, world_sketch, opening_text,
   bundled actor/world refs, tags[], visibility (private/public), author, created/updated.
2. **Authoring UI** in Creative Studio: compose/edit a scenario; pick a world + characters;
   write opening; tag; set visibility.
3. **Catalog + discovery:** list/browse/search scenarios (FTS on title/description/tags);
   public share + remix (fork) support.
4. **Start-from-scenario flow:** selecting a scenario seeds a new chat/story with its world +
   actors + opening pre-loaded (reuses `seedTemplate` / `seedWorlds` mechanics).
5. **Distinction from generation:** delegates dynamic scenario *generation* to
   `TASK-assistant-scenario-source` / generation provider; this task owns authoring + catalog.

## Acceptance Criteria

- Authors can create/edit a scenario (title, description, world sketch, opening, bundled
  actors, tags, visibility) in Creative Studio.
- Catalog lists/browses/searches scenarios; public scenarios shareable + remixable.
- Starting a chat/story from a scenario pre-loads its world + actors + opening.
- No overlap with `TASK-assistant-scenario-source` (generation/blog bridge) — clear boundary.
- Tests: author → catalog → start flow.

## Related Files

- `src/config/sections/characters/types.ts` (`scenario?` field — candidate to fold into Scenario)
- `src/assistant/scenario-source.ts` (recovered design seed)
- `src/seeding/worlds.ts`, `src/characters/seed/templates.ts` (reuse for start-from-scenario)
- Creative Studio frontend (`src/frontend/`, `src/components/`)

## Notes

- Do NOT rebuild the generation-side store here; reference `TASK-assistant-scenario-source`.
- `character.scenario` free-text can remain as a fallback / inline opening.
