<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Autonomy Config Surface

**Status:** Done
**Priority:** high
**Effort:** Medium (layering API + UI affordances + pacing presets)
**Epic:** epic-actor-autonomy-story-drive.md
**Tags:** actor-autonomy-story-drive
**Summary:** Provide the layered configuration surface for actor autonomy pacing: world default → chat override → per-actor override, with pacing presets (serene / organic / brisk), an unlimited stress preset gated to dev builds, and UI affordances in chat + world settings pages.
**Context:** Referenced by `epic-actor-autonomy-story-drive.md` Work Item list as `TASK-autonomy-config-surface` (line 72) and Concrete Implementation table row 6 (line 106). Listed as `TBD — needs filing` in the gap-audit (2026-09-23). The autonomy subsystem already has `NpcNavigationService` and the story auto-drive scheduler; this ticket supplies the user-facing config knobs that tune it.

**Acceptance Criteria:**
- [x] Layered config schema: world-level default → chat-level override → per-actor override, with the precedence rules codified and unit-tested.
- [x] Preset registry: `serene`, `organic`, `brisk` ship as built-in presets; `unlimited-stress` is gated behind `process.env.NODE_ENV !== 'production'`.
- [x] Chat settings page exposes the autonomy section with a per-chat override.
- [x] World settings page exposes the autonomy default + per-actor override editor.
- [x] The autonomy subsystem reads the layered config at every tick (no caching past the chat-session boundary).
- [x] Unit tests cover the layering rules and the dev-only gating.
- [x] `bun run check` green.

## Implementation Notes

Shipped in `src/autonomy/config/` — `resolveAutonomyConfig(db, { worldId,
chatId, actorId })` is the single entry point the governor and the scheduler
read on every beat.

- Layering (highest wins): per-actor override (stored as a JSON blob inside
  `character_internal_traits.autonomy_preferences.autonomy`) → per-chat
  override (`chats.autonomy_config`) → per-world default
  (`worlds.autonomy_config`) → the `organic` preset baseline. A layer only
  overrides the fields it explicitly sets, so a chat can raise the tick
  interval without resetting the budget caps. Columns land in
  `025_autonomy_config_columns.ts`.
- Presets: `presets.ts` holds `serene` / `organic` / `brisk` (always
  available) plus `unlimited-stress`, which `getPreset` refuses with
  `UnboundedStressGatedError` when `NODE_ENV === 'production'` — a hard
  throw, not a silent fallback, so a production build cannot quietly run
  unbounded ticking.
- No caching: the resolver queries per call, so a mid-session edit takes
  effect on the next tick rather than the next restart. That is deliberate
  — in the autonomy loop a stale pacing value reads as a hang rather than a
  lag.

## Write path (the gap the columns left open)

Migration 025 created `autonomy_config` on both tables, but **no route
accepted the field** — the columns were readable and never writable, so any
settings UI would have shown a saved value that the resolver never saw.
Fixed at the source, on both layers:

- **World**: `PUT /api/worlds/:worldId` takes `autonomyConfig` (object, JSON
  string, or null). Normalised by `src/routes/worlds/autonomy-config.ts`;
  invalid JSON is a 400 rather than a silently-ignored blob. Guarded by the
  existing `requireWorldOwner`.
- **Chat**: `PUT /api/v1/chats/:id` takes `autonomyConfig`, threaded through
  `updateChat` under the same `hasExplicit` rule the other optional chat
  fields use, so an unrelated save cannot wipe the layer.

**Clearing is `{}`, not SQL NULL.** Both columns are `NOT NULL DEFAULT '{}'`
and the resolver reads `{}` as "no override", so `null`/`""` on the world
layer and `{}` on the chat layer write the empty object. The shared constant
`EMPTY_AUTONOMY_OVERRIDE` (`src/autonomy/config/presets.ts`) keeps the two
layers from drifting apart.

**Tests:** `src/autonomy/config/config-api.test.ts` is the seam the resolver
suite could not cover — it writes through the real API and reads back through
`resolveAutonomyConfig`, so a mis-encoded field or a layer that stops
persisting fails there. `resolver.test.ts` seeds columns with raw SQL and
stays green through all of those breakages.

**Surfaces:** `src/components/autonomy-panel.html`, mounted twice from the one
`autonomyPanelFactory` in `src/frontend/alpine/autonomy-panel.ts` — on the
world-edit page's Autonomy tab (`layer: 'world'`, plus the per-actor editor)
and in the chat settings modal (`layer: 'chat'`, behind
`x-if="currentChat?.world_id"` — a chat with no world has no pacing to
tune). Reads go through `GET /api/worlds/:worldId/autonomy`, which returns
each layer separately next to the merged config, so a page can show
inherited vs overridden per field.

**Writes split by what already owns the column.** The world and chat layers
need no save route of their own: their columns live on rows the existing
`PUT /api/worlds/:worldId` and `PUT /api/v1/chats/:id` already update. The
per-actor layer had no such host — it lives inside
`character_internal_traits`, and the traits PUT takes the actor as a query
param on a route declared as a computed const, which the FE/BE harmonization
checker cannot see. Rather than loosen a shared gate, the actor write got its
own route: `PUT /api/worlds/:worldId/autonomy/actor/:actorId`
(`src/routes/worlds/autonomy-routes.ts`), delegating to
`CharacterInternalTraitsService.upsert`. Two gates, not one:
`requireWorldOwner` for the world and `requireActorAccess` for the
character, because owning a world is not owning its cast. `{}` clears the
layer, matching the other two.

The panel drafts from the LAYER's own values, never the merged ones: seeding
the form from `resolved` would write every inherited field back as an
override on the first save, freezing the preset's tuning into a per-layer
override.

**Tests:** `autonomy-routes.test.ts` covers the actor PUT's precedence, the
`{}` clear, traits preservation, and both auth gates.
`autonomy-panel.browser.ts` drives both real surfaces — the world tab writes a
character's `autonomy_preferences`; the chat modal writes
`chats.autonomy_config` and stays hidden for a world-less chat.
**Related:** TASK-autonomy-rate-governor, TASK-story-auto-drive-scheduler, epic-actor-autonomy-story-drive.md:70-72, epics-index.md (EPIC-RESEARCH-AGENCY-DECISION)


git issue: d08a0f2
