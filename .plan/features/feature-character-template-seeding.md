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
