<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Character Specification — Unified Setup API

> **Status:** Partially implemented — canonical model, validation, storage formats, and import/export live in `src/`; review workflow, version migration, bulk IO, and LSP schema are design-only. Authoritative source: `src/` and `AGENTS.md`.

## Implemented

- **Canonical fields** — mandatory `name`, `description`, `personality`, `appearance`, `default_outfit`, `outfits` (1–20, unique ids); optional `nickname`, `scenario`, `welcome_message`, `mes_example`, `system_prompt`, `post_history_instructions`, `alternate_greetings` (≤10), `tags` (≤20), `creator`, `creator_notes`, `character_version` — `src/characters/spec/character.ts`.
- **Strict/relaxed validation** (`ValidationMode`) — `src/characters/validator/` (fields, outfits, content-rating, extensions).
- **Extensions map** — `stats`, `inventory`, `relationships`, `world_modifiers`, `plugin_bundle`, `feature_flags`, `translations`, `LocaleConfig` — `src/characters/spec/character.ts`. Behavioral dimensions (coping/approach/autonomy) are first-class fields, not extensions — see `epic-character-internal-traits.md` (D7–D9).
- **NSFW fields** `content_rating`/`nsfw_categories`/`nsfw_hard_limits`; runtime 5-tier rating `src/schemas/nsfw-rating.ts`; age gating via `src/middleware/nsfw-gate/` (config `nsfwMinAge` + age-gate acceptance; the spec's per-rating 13+/18+ table remains design).
- **First-class storage formats** — canonical JSON + `storage_format`/`data_source_format`/`data_json`/`data_yaml`/`data_toml` columns — `src/characters/spec/character.ts`.
- **Import/export** — JSON V2/V3, PNG V2/V3, CHARX (ZIP card.json + assets), Character.AI — `src/characters/parser.ts`, `src/characters/normalizers/`, `src/characters/charx.ts`; routes `src/routes/character-io/`, CRUD `src/routes/characters/`.
- **Inventory lifecycle** (not a character field): `extensions.inventory` template hint → per-world seed `starting_inventory` (`src/story/world-state/init.ts`) → runtime truth `world_items`/`actor_items`.
- **Impersonation** — `chat_participants.impersonate_actor_id`, `/impersonate` + `/char` commands (`src/assistant/commands/impersonate.ts`), prompt identity injection `src/assistant/prompt/sections/user-persona.ts` (impersonation beats persona).

## Not implemented / aspirational

- Review workflow (draft → pending_review → approved/rejected → archived; submit/approve/reject endpoints; LLM reviewer role) — no code.
- Version migration API (`/migrate`, migration-status/report) — no `src/characters/migration.ts`.
- Bulk IO (`/api/characters/bulk`, async CHARX 202 + job polling, character import-from-URL) — not present; CHARX parses synchronously.
- LSP/JSON Schema endpoint `/schemas/character-card.json` — absent.
- World/style validation rules (`WorldValidationRules`, `WorldStyleRules`), plugin-bundle loading, feature-flag subsystem gating — design only.
- `POST /api/characters/:id/deimpersonate` + per-context impersonation permission matrix — only the chat command exists.

## Epics

- `.plan/epics/epic-character-core-system.md` — character domain epic.
- `.plan/epics/epic-character-internal-traits.md` — behavioral dimensions (D7–D9).
- `.plan/epics/epic-wardrobe-avatar-variants.md` — outfit lifecycle beyond the creation-time default.

## Unique content

- The detailed constraint tables (field length caps, rating × minimum-age matrix, format tables, plugin-bundle YAML example) were compressed here; normative enforcement lives in `src/characters/validator/` — treat code as authoritative where they disagree.
- The inventory three-layer model and impersonation-vs-persona prompt priority are retained above; they exist nowhere else in docs.
