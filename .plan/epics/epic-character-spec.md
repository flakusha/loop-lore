<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Character Specification & Unified API

**Overview:** (see sections below)


**Status:** In Progress
**Status Note:** verified 2026-10-09: canonical type model, strict/relaxed validation, format conversion (JSON/CCv2/CCv3/Character.AI/YAML/TOML/PNG/CHARX) and the review state machine all ship (`src/characters/spec/`, `src/characters/validator/`, `src/characters/parser.ts`, `src/characters/service/approval.ts` + `src/routes/characters/approval.ts`); still design-only are bulk IO, the version-migration API, world/style rules, locale runtime and the LSP endpoint — scope items marked per-row below.
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

## Implemented (verified 2026-10-09)

- **Canonical spec types** — `src/characters/spec/character.ts` (mandatory
  `name`/`description`/`personality` … plus `appearance`, `default_outfit`,
  `outfits`, `CharacterExtensions`, `LocaleConfig` at `:108`),
  `character-record.ts` (storage + migration + review record shape),
  `character-richer-fields.ts`, `enums.ts` (`ValidationMode:18`, `ReviewState:26`,
  `MigrationStatus:57`, `StorageFormat:67`, `ImportFormat:76`), `growth.ts`,
  `lorebook.ts`, `serde.ts`, barrel `index.ts`.
- **Strict/relaxed validation** — `src/characters/validator/index.ts:42`
  `validateCharacter(character, mode: ValidationMode = "strict")`, with mode-aware
  `fields.ts` (strict says *must*, relaxed says *recommended* — `fields.test.ts:161`),
  `outfits.ts`, `content-rating.ts`, and `extensions.ts` covering `feature_flags`,
  `inventory` and `relationships` (`extensions.ts:30-47`).
- **Format conversion** — parse in `parser.ts` (JSON / CCv2 / CCv3 / Character.AI /
  json-flat / YAML / TOML / PNG magic / CHARX ZIP detection) via `normalizers/`
  (`ccv2`, `ccv3`, `character-ai`, `json-flat`, `toml`, `yaml`); `charx.ts` for the
  CHARX bundle; `steganography.ts` for PNG V2/V3 payloads; export in `exporters/`
  (`ccv2`, `ccv3`, `png`, `toml`, `yaml`).
- **Storage** — canonical JSON on `actors`, with `data_source_format` and `data_raw`
  columns (`src/db/migrations/001_init.ts:954-955`).
- **Review workflow** — `src/characters/service/approval.ts` implements
  `draft → pending_review → approved | rejected` (`submitForReview` / `approve` /
  `reject`, character-actor-only, owner-for-submit); `actors.review_state` added by
  `src/db/migrations/042_actor_review_state.ts:15`; HTTP surface
  `src/routes/characters/approval.ts`, mounted at `src/routes/characters/index.ts:32`.
- **Content rating** — `actors.content_rating` default `sfw` (`001_init.ts:952`),
  validator `validator/content-rating.ts` + test, runtime 5-tier
  `src/schemas/nsfw-rating.ts`, age gating `src/middleware/nsfw-gate/`.
- **JSON Schema publication** — generator `src/config/generate-character-schema/index.ts`
  writes `schemas/character-card.schema.json`.
- **Tests** — `src/characters/parser.test.ts`, `exporters.test.ts`, `charx.test.ts`,
  `steganography.test.ts`, `validator/fields.test.ts`, `validator/extensions.test.ts`,
  `validator/content-rating.test.ts`, `spec/inclusion.test.ts`,
  `src/characters/service/approval.test.ts`, `src/routes/characters/approval.test.ts`.

## Current State

| # | Scope item | Status | Where |
| - | --------- | ------ | ----- |
| 1 | Unified Character Spec (fields, `extensions`, NSFW rating, impersonation) | Shipped | `src/characters/spec/`, `src/characters/validator/`, `src/assistant/commands/impersonate.ts` |
| 2 | Format Conversion (YAML/TOML first-class, JSON canonical, PNG/CHARX) | Shipped — but PNG is **not** import-only | `parser.ts`, `normalizers/`, `exporters/png.ts`, `charx.ts`, `steganography.ts` |
| 3 | API Design — single IO + strict/relaxed + review workflow | Partial | single-actor IO (`src/routes/characters/`, `src/routes/character-io/`) and review workflow ship; **bulk** IO (`/api/characters/bulk`, async CHARX `202` + polling) has no route |
| 4 | Content Rating Propagation — age-based filtering, chat enforcement, age verification | Partial | column + validator + `nsfw-gate` ship; the per-rating 13+/18+ minimum-age table is still design-only (`docs/spec/character-spec.md`) |
| 5 | Migration System — version migration, auto-fill, readiness, reports | Not shipped | `MigrationStatus` + record fields only (`spec/enums.ts:57`, `spec/character-record.ts:34-36`); no `migration.ts`, no `/migrate`, no report |
| 6 | Multi-Language Support — translation fields, locale config, auto-spec translation | Partial — types only | `LocaleConfig` + `extensions.translations` (`spec/character.ts:108,186`); no `locale.ts`, no reconciliation pass |
| 7 | World/Style Validations — world rules, style constraints, opt-in flags | Partial | feature-flag key/type validation ships (`validator/extensions.ts:30-47,191-231`); `WorldValidationRules` / `WorldStyleRules` do not exist |
| 8 | Game Rules / Mechanics Config — plugin-bundle presets, config-driven rules | Partial | `extensions.plugin_bundle` is a declared field (`spec/character.ts:184`); no preset loader, no config-vs-hardcode switch, not validated |
| 9 | LSP/IDE Support — JSON Schema publication, YAML/TOML LSP | Partial | `schemas/character-card.schema.json` + generator ship; no `/schemas/character-card.json` HTTP endpoint, no YAML/TOML LSP |

## Unticketed Gaps

Two drifts have no ticket. First, `CharacterRecord` declares `data_json: string`,
`data_yaml: string | null` and `data_toml: string | null`
(`src/characters/spec/character-record.ts:29-31`), but `actors` has only
`data_source_format` and `data_raw` (`001_init.ts:954-955`) and nothing in `src/`
reads or writes those three fields — the record type overstates the storage model, so
any consumer typed against it will read `undefined` columns. Second,
`docs/spec/character-spec.md:21` still lists the review workflow under "not
implemented / aspirational — no code", while `service/approval.ts`,
`routes/characters/approval.ts` and migration 042 have shipped it; the authoritative
spec therefore under-reports its own epic. Reconciling both is a doc/type fix with no
feature ticket attached.

## Scope

### In Scope

1. **Unified Character Spec** — mandatory/optional fields, multi-level
   object descriptions via `extensions`, NSFW content rating,
   impersonation rules — *shipped* (`src/characters/spec/`, `validator/`)
2. **Format Conversion** — YAML/TOML as first-class storage formats,
   JSON as canonical internal format, PNG/CHARX as import-only targets —
   *shipped, but PNG also exports* (`exporters/png.ts`), so "import-only" is stale
3. **API Design** — single and bulk IO endpoints, strict/relaxed
   validation modes, review workflow with Admin/Moderator/User/LLM roles —
   *single IO + strict/relaxed + review shipped; bulk IO absent; the LLM reviewer
   role has no implementation*
4. **Content Rating Propagation** — age-based filtering, chat-level
   enforcement, user age verification — *partial: column, validator and `nsfw-gate`
   ship; the rating × minimum-age table is design-only*
5. **Migration System** — version migration with auto-fill, readiness
   checks, and detailed migration reports — *not shipped; readiness type only*
6. **Multi-Language Support** — translation fields, locale configuration,
   auto-spec translations and reconciliation — *types only (`LocaleConfig`,
   `extensions.translations`)*
7. **World/Style Validations** — world-level validation rules, style
   constraints, opt-in feature flags — *feature flags validated; world/style rules
   absent*
8. **Game Rules / Mechanics Config** — plugin bundle presets,
   config-driven vs hardcoded rules, character-plugin integration —
   *declared field only (`extensions.plugin_bundle`)*
9. **LSP/IDE Support** — JSON Schema publication, YAML/TOML LSP compatibility —
   *schema file + generator shipped; no serving endpoint, no LSP*

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

## Files

Implemented (verified 2026-10-09):

| File | Purpose |
| ---- | ------- |
| `docs/spec/character-spec.md` | This specification |
| `src/characters/spec/` | Canonical character type definitions (supersedes the planned flat `spec.ts`) |
| `src/characters/validator/` | Strict and relaxed validation (supersedes the planned flat `validator.ts`) |
| `src/characters/parser.ts`, `normalizers/`, `charx.ts`, `steganography.ts`, `exporters/` | Format detection, conversion and export |
| `src/characters/service/approval.ts` | Review workflow state machine (supersedes the planned `review.ts`) |
| `src/characters/validator/content-rating.ts` | NSFW content-rating validation |
| `src/routes/characters/` | Character CRUD + review routes (supersedes the planned flat `routes/characters.ts`) |
| `src/routes/character-io/`, `src/routes/import/` | Systems import/export and actor/lorebook import |
| `src/middleware/nsfw-gate/`, `src/schemas/nsfw-rating.ts` | Age gating and the runtime 5-tier rating |
| `src/config/generate-character-schema/index.ts` | Generates the JSON Schema below |
| `schemas/character-card.schema.json` | JSON Schema for IDE/LSP support |

Planned (do not exist yet):

- `src/characters/spec.ts` — superseded by the `src/characters/spec/` directory
- `src/characters/validator.ts` — superseded by the `src/characters/validator/` directory
- `src/characters/locale.ts` — multi-language translation runtime
- `src/characters/migration.ts` — version migration logic (only `MigrationStatus` types exist)
- `src/characters/review.ts` — superseded by `src/characters/service/approval.ts`
- `src/characters/validator-rules.ts` — world/style validation rules
- `src/routes/characters.ts` — superseded by the `src/routes/characters/` directory
- `src/routes/character-import.ts` — superseded by `src/routes/import/` + `src/routes/character-io/`
- `schemas/character-card.json` — the shipped file is `schemas/character-card.schema.json`
- `/api/characters/bulk` (async CHARX `202` + job polling, import-from-URL) — no route file

## Dependencies

- `epic-character-core-system.md` — character data model (traits, mood, relationships)
- `epic-import-export-io.md` — import/export infrastructure
- `epic-plugin-system.md` — plugin bundle system for game rules
- `epic-nsfw-game-mechanics.md` — NSFW content handling in game context
- `epic-impersonation.md` — impersonation system
- `epic-wardrobe-avatar-variants.md` — `CanonicalCharacter` and `CharacterTemplate` carry `default_outfit` + `loadout[]` once that epic lands; selection algorithm extends this spec's avatar fields

## Testing

| Test File | Coverage |
| --------- | -------- |
| `src/characters/parser.test.ts` | Format detection + normaliser round-trips (CCv2/CCv3/Character.AI/YAML/TOML/PNG) |
| `src/characters/exporters.test.ts` | Export + format detection for ccv2/ccv3/png/yaml/toml |
| `src/characters/charx.test.ts` | CHARX archive round-trip and missing-`card.json` failure |
| `src/characters/steganography.test.ts` | PNG V2/V3 payload embed + extract |
| `src/characters/spec/inclusion.test.ts` | Identity-field inclusion, strict/relaxed length caps, alias normalisation |
| `src/characters/validator/fields.test.ts` | Strict vs relaxed validation wording and enforcement |
| `src/characters/validator/extensions.test.ts` | Extension value bounds, mode severity, unknown feature-flag keys |
| `src/characters/validator/content-rating.test.ts` | Content-rating validation |
| `src/characters/service/approval.test.ts` | Review state machine transitions + actor-type scoping |
| `src/characters/integration.test.ts` | **Planned — file does not exist**; the end-to-end import → validate → store → export pipeline is covered only piecewise by the files above |

Also planned, none existing: `src/characters/spec.test.ts`,
`src/characters/validator.test.ts`, `src/characters/locale.test.ts`,
`src/characters/migration.test.ts`, `src/characters/review.test.ts`,
`src/characters/validator-rules.test.ts` — they map one-to-one to the Planned files
listed above.

## Linked Tasks

Statuses read from the ticket files on 2026-10-09.

- `TASK-character-spec-unified-api.md` (In Progress) — umbrella ticket for this epic
- `FEAT-gurps-point-buy-character-creation.md` (Done) — point-buy creation over the stat model
- `TASK-character-migration-route.md` (Not Started) — version-migration API (scope item 5)
- `FEAT-character-spec-inclusion-race-origin-culture.md` (Not Started) — race/origin/culture identity fields
- `FEAT-seed-default-characters-identity.md` (Not Started) — identity fields on seeded templates
- `FEAT-seed-default-characters-avatar.md` (Not Started) — avatar on seeded templates
- `TASK-char-editor-validation-spec-compliance.md` (Not Started) — editor honours this spec's validation
- `FEAT-fate-skill-pyramid.md` (Not Started) — FATE pyramid over the stat model
- `FEAT-fate-stress-tracks-consequences.md` (Not Started) — FATE stress/consequences

## Generation via Creative Studio Workflows

Character creation through the assistant is specified as a **config-driven workflow
template** in `epic-assistant-creative-studio-workflows.md` §7.6 — not as a one-off
slash command. The `character-generation` workflow
(`TASK-assistant-creative-studio-workflow-character.md`) wraps `/create character` with
step-by-step prompt building, `entity_type_presets.character` validation, and
schema/consistency/duplicate quality gates. Identity fields (name/species/homeland/
culture) align with `FEAT-origin-capture-generation-seeding.md`.
