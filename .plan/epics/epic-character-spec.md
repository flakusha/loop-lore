# EPIC: Character Specification & Unified API

**Status:** 🟡 In Progress
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** character, spec, api, validation, format-conversion

## Summary

Unified character specification and API that defines mandatory and
optional fields, multi-level object descriptions, format conversion
logic, validation modes (strict/relaxed), review workflow, content
rating propagation, impersonation rules, and migration system.

This epic consolidates the character setup spec (`docs/spec/character-spec.md`)
into a single authoritative document and implements the corresponding
API endpoints.

## Scope

### In Scope

1. **Unified Character Spec** — mandatory/optional fields, multi-level
   object descriptions via `extensions`, NSFW content rating,
   impersonation rules
2. **Format Conversion** — YAML/TOML as first-class storage formats,
   JSON as canonical internal format, PNG/CHARX as import-only targets
3. **API Design** — single and bulk IO endpoints, strict/relaxed
   validation modes, review workflow with Admin/Moderator/User/LLM roles
4. **Content Rating Propagation** — age-based filtering, chat-level
   enforcement, user age verification
5. **Migration System** — version migration with auto-fill, readiness
   checks, and detailed migration reports
6. **Multi-Language Support** — translation fields, locale configuration,
   auto-spec translations and reconciliation
7. **World/Style Validations** — world-level validation rules, style
   constraints, opt-in feature flags
8. **Game Rules / Mechanics Config** — plugin bundle presets,
   config-driven vs hardcoded rules, character-plugin integration
9. **LSP/IDE Support** — JSON Schema publication, YAML/TOML LSP compatibility

### Out of Scope

- RPG combat mechanics (stats, dice, combat resolution) → `epic-rpg-mechanics.md`
- 3D avatar system → `TASK-3d-character-avatars.md`
- Emotion detection pipeline → `TASK-emotion-intent-detection.md`
- Dynamic stat updates during sessions → future epic
- Achievement/quest system → `epic-rpg-mechanics.md`

## Key Design Decisions

### Storage Format

- **Internal canonical format:** JSON (stored in `actors.data_json`)
- **YAML/TOML:** First-class storage formats (stored in `actors.data_yaml` / `actors.data_toml`)
- **PNG/CHARX:** Import-only formats, never stored natively

### Validation Modes

- **Strict:** All mandatory fields present and valid; optional fields
  validated if present. Default mode.
- **Relaxed:** Mandatory fields enforced; optional fields accepted
  without validation. Configurable per-server or per-admin preference.

### Review Workflow

Four roles (Admin, Moderator, User, LLM) with defined transitions:
`draft → pending_review → approved | rejected`

### CHARX V3 Bundles

Async processing with job polling. Frontend receives `202 Accepted`
and polls for completion.

## Key Files

| File                                | Purpose                                |
| ----------------------------------- | -------------------------------------- |
| `docs/spec/character-spec.md`       | This specification                     |
| `src/characters/spec.ts`            | Canonical character type definitions   |
| `src/characters/validator.ts`       | Strict and relaxed validation          |
| `src/characters/locale.ts`          | Multi-language translation support     |
| `src/characters/migration.ts`       | Version migration logic                |
| `src/characters/review.ts`          | Review workflow state machine          |
| `src/characters/validator-rules.ts` | World/style validation rules           |
| `src/routes/characters.ts`          | Updated routes with bulk IO and review |
| `src/routes/character-import.ts`    | Async import routes                    |
| `schemas/character-card.json`       | JSON Schema for IDE/LSP support        |

## Dependencies

- `epic-character-core-system.md` — character data model (traits, mood, relationships)
- `epic-import-export-io.md` — import/export infrastructure
- `epic-plugin-system.md` — plugin bundle system for game rules
- `epic-nsfw-game-mechanics.md` — NSFW content handling in game context
- `epic-impersonation.md` — impersonation system

## Testing

| Test File                                | Coverage                                            |
| ---------------------------------------- | --------------------------------------------------- |
| `src/characters/spec.test.ts`            | Mandatory/optional fields, multi-level descriptions |
| `src/characters/validator.test.ts`       | Strict vs relaxed validation modes                  |
| `src/characters/locale.test.ts`          | Translation fields, locale fallback                 |
| `src/characters/migration.test.ts`       | Version migration, auto-fill, readiness checks      |
| `src/characters/review.test.ts`          | Review workflow state transitions                   |
| `src/characters/validator-rules.test.ts` | World/style validation rules                        |
| `src/characters/integration.test.ts`     | Full import → validate → store → export pipeline    |

## Generation via Creative Studio Workflows

Character creation through the assistant is specified as a **config-driven workflow
template** in `epic-assistant-creative-studio-workflows.md` §7.6 — not as a one-off
slash command. The `character-generation` workflow
(`TASK-assistant-creative-studio-workflow-character.md`) wraps `/create character` with
step-by-step prompt building, `entity_type_presets.character` validation, and
schema/consistency/duplicate quality gates. Identity fields (name/species/homeland/
culture) align with `FEAT-origin-capture-generation-seeding.md`.
