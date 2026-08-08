# EPIC: Character Core System

**Status:** 🟡 Partial — character core services (traits, mood, relationships, avatars, licensing) + API/IO routes + tests complete; RPG stat system + template system in progress
**Priority:** High
**Effort:** High
**Type:** Foundation Epic
**Tags:** characters, stats, personality, core-system

## Summary

Core character data model and services — mandatory/optional fields, RPG stats, personality traits, validation, and the unified character API. Foundation for character generation, import, and all character-consuming systems.

## Reference

- Spec: `docs/spec/character-spec.md` (611 lines — authoritative)
- Spec: `docs/spec/character-interactions.md`
- Spec: `docs/spec/rpg-mechanics.md`

## Scope

- Mandatory fields: `name`, `description`, `personality`
- Optional fields: `nickname`, `scenario`, `welcome_message`, `mes_example`, `system_prompt`, `post_history_instructions`, `alternate_greetings`, `tags`, `creator`
- RPG stats (STR, DEX, CON, INT, WIS, CHA, etc.)
- Personality traits, bonds, flaws, ideals
- Character validation (field lengths, constraints)
- Unified character API

## Current State (verified 2026-08-04)

The unified character API is **implemented and wired** — no `TBD` remains in `src/routes/characters.ts`:

- `charactersRoutes` mounted at `src/elysia-app.ts:163`
- Full CRUD: `GET/POST /api/actors`, `GET /api/actors/:actorId`, `GET /api/actors/:actorId/card`, `PUT/DELETE /api/actors/:actorId`, `GET /api/actors/:actorId/export`, `POST /api/actors/import`
- Companion character sub-routes all wired: `character-traits`, `character-mood`, `character-relationships`, `character-avatars`, `character-emotions`, `character-emotion-avatars`, `character-availability`, `character-licensing`, `character-io` (each mounted in `elysia-app.ts`)
- Personality + traits services: `src/characters/services/personality-service.ts`, `traits-service.ts`
- RPG subsystem (dice, combat, achievements, crafting, encounters, spells) under `src/rpg/`
- Import/export per `epic-import-export-io.md`

## Tasks

- [x] Character validation schemas (field lengths, required fields) — TypeBox `src/validation/schemas.ts`
- [x] Personality trait system — `traits-service.ts` + `personality-service.ts`
- [x] Character CRUD API routes — `src/routes/characters.ts` (wired, tested)
- [x] Character search/filter — `GET /api/actors` with `page`/`pageSize`/`type` query
- [ ] RPG stat system (base stats, modifiers, derived stats) — `src/rpg/` partial (dice/combat exist)
- [ ] Character template system — pending prompt-template-registry work

## Files

- `src/db/schema-core.ts` — Actors table (shared with actor system)
- `src/routes/characters.ts` — character API (implemented, wired)
- `src/rpg/` — RPG stat calculations (partial: dice, combat, achievements, etc.)

## Acceptance Criteria

- [x] Character creation with mandatory fields validated
- [x] Optional fields with correct defaults
- [ ] RPG stats calculate correctly
- [x] Character API serves full character data
- [x] Tests passing

## Related Epics

- `epic-actors.md` — characters are actors; this epic focuses on character-specific fields
- `epic-assistant-gm-flows.md` — character generation targets this system
- `epic-rpg-mechanics.md` — stat system integration
- `epic-character-spec.md` — spec details
- `epic-achievements.md` — stat-based achievements depend on character stats

## Tickets

- `TASK-character-core-system.md` — implementation tasks

---

## Merged from `.plan/epics/epic-character-core-system.md`

# Feature: Character Template Seeding

**Status:** ✅ Implemented
**Epic:** 46 (Creative Studio) — related
**Files:** `src/config/sections/characters.ts`, `src/config/character-loader.ts`, `src/config/templates-loader.ts`, `src/characters/seed.ts`, `src/server.ts`

## Summary

Default character templates are automatically seeded on app start. Built-in defaults (6 characters) are always seeded; user character files from `configs/characters/` are merged by name. Supports hard IDs for deterministic test reseeding.

## Key Capabilities

### 1. Built-in Default Characters

Six characters shipped with the app:

| Character          | Genre         | Role                    | ID                       |
| ------------------ | ------------- | ----------------------- | ------------------------ |
| Elara Nightwhisper | Fantasy       | Guide/lore sage         | `tpl-elara-nightwhisper` |
| ARIA-7             | Sci-Fi        | AI companion            | `tpl-aria-7`             |
| Detective Morgan   | Modern        | Mystery solver          | `tpl-detective-morgan`   |
| Dr. Alexis Thorne  | Horror        | Paranormal investigator | `tpl-dr-thorne`          |
| Yuki Tanaka        | Slice of Life | Neighbor/friend         | `tpl-yuki-tanaka`        |
| Assistant          | Assistant     | Helpful AI              | `tpl-assistant`          |

### 2. Character File Loading

Characters can be defined in two ways:

**Single-character files** (`configs/characters/elara-nightwhisper.yaml`):

```yaml
id: "tpl-elara-nightwhisper"
name: "Elara Nightwhisper"
description: "An ancient elven sage..."
# ... other fields
```

**Multi-character files** (`configs/characters/group-fantasy-scifi.yaml`):

```yaml
templates:
  - name: "Character 1"
    description: "..."
  - name: "Character 2"
    description: "..."
```

### 3. Hard IDs for Test Reseeding

Characters can have deterministic IDs (`id: "tpl-elara-nightwhisper"`) for:

- Easy DB cleanup in tests
- Deterministic test fixtures
- Migration testing

### 4. Access Control

Each template supports:

- `visibility`: `"private"` | `"public"` — who can see the character
- `content_rating`: `"sfw"` | `"nsfw_*"` — content classification
- `target_roles`: `("admin" | "user" | "viewer" | "solo")[]` — which user roles can use

### 5. Admin Configuration

- `is_template`: Can be used as template for user-created characters
- `is_default`: Auto-add to new users' character list

## Configuration

### Built-in Defaults

Always seeded from `CHARACTERS_DEFAULTS` in `src/config/sections/characters.ts`.

### Character Files

Place `.yaml`, `.yml`, or `.toml` files in `configs/characters/`:

```yaml
# Single character
id: "tpl-my-character"
name: "My Character"
description: "A character description"
visibility: "public"
content_rating: "sfw"
target_roles: ["user", "admin"]
is_template: true
is_default: true
```

### Template Config Override

Also supported via `configs/templates/character.yaml`:

```yaml
merge: extend # extend | override | replace
templates:
  - name: "My Character"
    description: "..."
```

## Merge Logic

1. Load built-in `CHARACTERS_DEFAULTS.templates`
2. Load character files from `configs/characters/`
3. Load `configs/templates/character.yaml` (if exists)
4. Merge all by name (case-insensitive) — later sources override earlier
5. Seed merged list (idempotent — skip existing)

## Seeding Flow

1. `server.ts` calls `loadTemplateConfig()` → loads all templates including characters
2. `mergeCharacterTemplates()` merges built-in + template-loaded
3. `seedCharacterTemplates()` seeds merged list
4. For each template:
   - Check if exists by `display_name` + `owner_id`
   - If exists: skip
   - If not: insert with hard ID or generated ID

## Files

- `src/config/sections/characters.ts` — Config schema + built-in defaults
- `src/config/character-loader.ts` — Character file loader (configs/characters/)
- `src/config/templates-loader.ts` — Template loader with character support
- `src/config/schema.ts` — `CharactersConfig` interface
- `src/characters/seed.ts` — Seeder + merge function
- `src/server.ts` — Startup integration
- `configs/characters/*.yaml` — Example character files
- `configs/templates/character.example.yaml` — Example template config
- `.plan/tickets/TASK-character-template-seeding.md` — Task tracking

