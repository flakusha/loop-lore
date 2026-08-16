<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: World-Template Chat Lifecycle (Location → Public Chat, Template Selection, Feature List, Config Templates)

**Status**: open
**Priority**: high
**Labels**: chat, templates, world, locations, rpg, frontend, config
**Assignee**:
**Epic**: epic-world-locations, epic-config-templates, epic-chat-transfer-location
**Related**: FEAT-chat-template-config-lifecycle, IDEA-chat-setup-templates,
TASK-world-locations, TASK-chat-locations-worlds-finalize-current-implementation,
FEAT-chat-transfer-location-change, TASK-bound-linked-travel-prompts

## Description

Close the location↔chat template gap: **every location gets a public chat bound to a
default `world` chat template at creation**, template selection with **feature-list
descriptions** is offered on location/world/chat creation, templates are code-defined +
config-extendable + idempotently seeded, and locations/chats bound to a **non-default**
world template are **marked in the frontend**.

Reconciliation audit (2026-08-15) found the chat-setup-template backbone already shipped
(`chat_setup_templates` table, `chats.template_id`, CRUD routes, idempotent code seeding,
`POST /api/chats` templateId seeding, online key-mechanic immutability, `migrateChat` +
carry). Missing: `world` template, location→chat auto-creation, any public-chat concept on
`chats`, template selection/feature-list UI on location & world creation, `features` field
on the template schema, config-file template extension + example files, fine-tune fields in
the new-chat form, missing i18n keys, and frontend marking of non-default bindings.

## Design

### 1. `world` template (default binding for location chats)

Add to `CHAT_SETUP_TEMPLATE_DEFAULTS` (`src/chat/service/templates.ts`):

```ts
{
  id: "template-world",
  slug: "world",
  name: "World Chat",
  description: "Public world/location chat: RPG narration, round-robin turns, no GM/assistant.",
  mode: "story",            // rpg mode
  turn_strategy: "round_robin",
  visual_novel: 0,
  features: ["rpg mode", "no gm", "no assistant"], // enforced where mechanics exist
}
```

### 2. Template schema gains a `features` list

- Migration `038_chat_setup_template_features.ts`: add `chat_setup_templates.features`
  (TEXT, JSON array of strings) — display-only feature tags ("rpg mode", "vn mode",
  "no quests", "sfw only", "no gm", "no assistant", …).
- `ChatSetupTemplate` type + `ChatSetupTemplateSchema` + CRUD round-trip the array.
- Server renders the feature list into each template's payload; UI shows it on selection.

### 3. Location creation → public chat bound to the `world` template

- New `chats` column: `is_public` (integer 0/1, default 0) — discoverability for
  location/world chats. Public chats joinable via existing `POST /api/chats/join` +
  `GET /api/chats/joinable`.
- `handleCreateLocation` (`src/routes/worlds/locations.ts`) — after the location insert,
  auto-create a chat: `name = location name`, `world_id = worldId`,
  `current_location_id = location id`, `template_id = template-world`, `is_public = 1`,
  owner = world owner. Idempotent (skip if a public chat for that location already exists).
- `POST /api/worlds/:worldId/locations` body gains optional `templateId` +
  `fineTune` overrides (explicit beats default `world` template) — a location may
  therefore be created with a **non-default** template; that binding is what frontend
  marks.
- Assistant `/create location` command (`src/assistant/commands/create.ts`) follows the
  same auto-chat rule.

### 4. Template dropdown + feature-list description on location & world creation

- `src/views/world-detail.html` + `src/frontend/pages/worlds.ts` create-location form:
  template `<select>` (default = `world`), feature list rendered under it on change
  (same behavior as chat creation).
- `src/views/new-chat.html` + `src/frontend/pages/new-chat/index.ts`:
  - `change` handler pre-fills `mode`, `turnStrategy`, `worldId`, `gmConfig`, `visualNovel`
    (form fields exposed for fine-tuning — see §5), not just `mode`.
  - feature list `<ul>` re-rendered from `t.features` on every selection change.
- Fix missing i18n keys `chats.setupTemplate`, `chats.noTemplate`,
  `chats.setupTemplateDescription` (all 10 locales).

### 5. Fine-tuning at creation

- `new-chat.html` exposes `turnStrategy`, `worldId`, `visualNovel` (+ full `gmConfig`
  role select); explicit user values override template seeding (backend already honors
  explicit-over-template in `src/routes/chats/create.ts`).
- Location creation accepts the same override surface.

### 6. Configurable templates + example files + idempotent seeding

- Config-file extension: `configs/templates/chat-setup.yaml` (pattern matches existing
  `configs/*.example.toml|yaml` convention) with example file
  `configs/config.chat-templates.example.yaml` documenting schema + a custom template.
- Seeding becomes **upsert-by-slug idempotent**: code defaults seed when missing;
  config-declared templates merge/override by slug; never duplicate, never clobber
  admin-created or existing-bound snapshots. (Today seeding is all-or-nothing
  only-when-table-empty — new defaults never backfill existing DBs.)

### 7. Frontend marking of non-default bindings

- Chat list / location panel: badge on chats whose `template_id` is not the `world`
  template (or template missing), e.g. "custom template: {name}". World-detail location
  rows show the bound template name + badge when non-default.
- Needs `template` info on chat list payloads (`GET /api/chats`, world chats endpoint).

## Acceptance Criteria

- [x] `template-world` default exists (slug `world`, features `["rpg mode","no gm","no assistant","public"]`)
- [x] `chat_setup_templates.features` column + type + schema + CRUD round-trip
- [x] `chats.visibility` TEXT STATE (private|public|unlisted — NOT a boolean flag; see
      Decision below) + location creation auto-creates public chat bound to `world`
      template (transactional, owner = world owner)
- [x] Location create accepts `templateId` + fine-tune overrides; non-default binding persisted
- [x] Template `<select>` + dynamic feature-list on location creation UI (world-detail)
      and chat creation UI (new-chat)
- [x] new-chat form exposes `turnStrategy`/`visibility`/`visualNovel` fine-tune; explicit
      overrides template (`gmConfig` via gm-guided toggle)
- [x] i18n keys present in all 10 locales
- [x] Config-file templates loader (`configs/templates/chat-setup.yaml`) + example file
      `configs/templates/chat-setup.example.yaml`; seeding idempotent upsert-by-slug
- [x] Frontend badge on locations with non-default template binding (world-detail);
      chat-list badge deferred (needs template payload on chat list)
- [~] Tests written (world template, features/visibility round-trip, backfill idempotency,
      location auto-chat, override precedence) — runtime verification gated on migrations 038/039
      landing (DB refactor in progress in parallel session)

## Decision (2026-08-15)

Visibility is a **text state machine, not a boolean flag** (repo bans boolean flags —
precedent: `PinnedState`, `WorldVisibility`): `chats.visibility` and
`chat_setup_templates.visibility` use `ChatVisibility` enum values
`private | public | unlisted`, seeded from the template at chat creation.
Future levels (invite-only, world, friends) extend the enum without schema churn.
This replaced the originally drafted `is_public` integer column.

## Files

- `src/db/migrations/038_chat_setup_template_features.ts` — features + visibility columns (new; in-flight with DB refactor)
- `src/db/migrations/039_chat_public_flag.ts` — `chats.visibility` state (new; in-flight with DB refactor)
- `src/chat/service/templates.ts` — `world` template, features + visibility, upsert-by-slug seeding, config-file merge (done)
- `src/config/schema/assistant.ts` + `sections/assistant.ts` — no change here; visibility enum in `src/db/enums-core/users.ts` (done)
- `src/chat/service/types.ts` — `ChatSetupTemplate.features`, `isPublic` on create params
- `src/chat/service/crud/create.ts` — `is_public` insert
- `src/validation/schemas/chat.ts` — features + `ChatVisibilitySchema` on template/chat schemas
- `src/routes/chats/templates.ts` — feature round-trip
- `src/routes/worlds/locations.ts` — auto-chat on location create
- `src/assistant/commands/create.ts` — location auto-chat
- `src/routes/chat-search/joinable.ts` — public chat discovery (may already apply)
- `src/views/world-detail.html` + `src/frontend/pages/worlds.ts` — template select + features
- `src/views/new-chat.html` + `src/frontend/pages/new-chat/index.ts` — features list, fine-tune fields, i18n
- `src/components/chat/chat-list-panel.html` / `location-panel.html` — non-default badge
- `configs/config.chat-templates.example.yaml` — example (new)
- `src/public/locales/*.json` — i18n keys

## Notes

- Distinct from LLM prompt-text registry (`src/prompts/registry.ts`) — same
  "templates bound at creation" philosophy, different domain.
- Online immutability already enforced; `world`-bound chats respect it like any other.
- "No quests" / "sfw only" features are display tags for now unless/until quest-gate and
  nsfw-gate get config knobs; document enforcement state per feature.
- Travel/sectioning already implemented (`chat_sections` 031, routes, `PUT /api/chats/:id/location`,
  transfer/join); linked travel prompts tracked separately in TASK-bound-linked-travel-prompts.
