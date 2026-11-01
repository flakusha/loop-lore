<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: NSFW Body State Widget

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Status Note:** All implementation ACs green — verified via `bun run check --diff-base dev` (blocking gates pass) 2026-11-01; body-region display AC left open (blocked, no backend data source).
**Priority:** P0 — Critical
**Effort:** Medium
**Type:** Feature Task
**Tags:** nsfw, frontend, ui, body-state
**Epic:** epic-nsfw-ui

## Summary

Body state display for the chat character's physical state, rendered in the
Character Info panel below the read-only NSFW status panel
(TASK-nsfw-read-only-status-panel.md), reusing its api/state/i18n patterns.

## Backend data sources (ground truth)

- `GET /api/v1/chats/:id` — `character_id` + `world_id` (one request resolves
  both; same source the RPG stats and NSFW panels use).
- `GET /api/v1/rpg/stats/:actorId` — `hp`/`maxHp` (health meter) and
  `conditions` (JSON string of named conditions with source + duration —
  the disease/condition-effects display).
- `GET /api/v1/nsfw/arousal/:actorId?worldId=` — arousal level 0-100 with
  tier labels (the aroused/exhausted-style state indicator). Owner- and
  consent-gated; a 403 drops only the arousal row, like the status panel's
  per-section failure contract.

## Blocked (no data source)

- **Body region display (head, torso, limbs)** — no backend table or route
  exposes per-body-part state; not fabricated.
- **Fatigue** — no dedicated backend field; the only stamina value is the
  static body-profile trait already shown by the status panel.
- **Mood/happiness** — real data exists but is already rendered by the mood
  panel on the same surface; not duplicated.

## Implementation

- `src/frontend/nsfw/body-state.ts` — DOM-builder widget in the battle-panel
  style; health and arousal meters reuse the shared battle health-bar widget
  (`renderHealthBar`); all strings via `nsfw.bodyState.*` locale keys.
- `src/frontend/alpine/nsfw-body/` — api helpers (reusing the status panel's
  `NsfwFetchResult` vocabulary and `toResult` classifier), the
  `bodyStateState` Alpine mixin (load + mount into `$refs.bodyStatePanel`),
  loaded from `_selectChatInner` right after `loadNsfwPanel`.
- `src/components/chat/body-state.html` — mount-slot partial, included from
  `character-info-panel.html`; `.nsfw-body-state*` styles in `app.css`
  (responsive, ARIA-labelled, keyboard-transparent — display only).

## Acceptance Criteria

- [x] Health meter renders hp/maxHp from the RPG stats row via the shared health-bar widget
- [x] Active conditions (disease/condition effects) render with source and duration
- [x] Arousal meter renders the world-scoped level with localized tier labels; a 403 drops only that row
- [x] Widget renders nothing when no section has data; never throws on failures
- [x] i18n: all strings via `nsfw.bodyState.*` keys in all 10 locales
- [x] ARIA labels and responsive CSS consistent with the character-info panel
- [x] Unit coverage for the widget, api helpers and state mixin
- [ ] Body region display (head, torso, limbs) — blocked: no backend data source

## Files

- `src/frontend/nsfw/body-state.ts` (new)
- `src/frontend/nsfw/body-state.test.ts` (new)
- `src/frontend/alpine/nsfw-body/api.ts` (new)
- `src/frontend/alpine/nsfw-body/api.test.ts` (new)
- `src/frontend/alpine/nsfw-body/state.ts` (new)
- `src/frontend/alpine/nsfw-body/state.test.ts` (new)
- `src/frontend/alpine/nsfw-body/index.ts` (new)
- `src/frontend/alpine/chat-types/body-state.ts` (new)
- `src/frontend/alpine/chat-types/chat-state.ts`
- `src/frontend/alpine/chat-types/index.ts`
- `src/frontend/alpine/chat/inline-state.ts`
- `src/frontend/alpine/chat/world.ts` (+ `world.test.ts`)
- `src/frontend/alpine/nsfw-panel/api.ts` (exported `toResult` for reuse)
- `src/components/chat/body-state.html` (new)
- `src/components/chat/character-info-panel.html`
- `src/public/css/app.css`
- `src/public/locales/*.json` (all 10 locales)

## Related

- `epic-nsfw-ui.md`
- `TASK-nsfw-read-only-status-panel.md` — the shipped panel whose patterns this reuses

**Resolved:** 2026-11-01 registry-driven close: git issue d0a78d3 (registry tip: e14f0d203 Konstantin Fedotov Auto-closed: appended .md marker marks TASK-NSFW-BODY-STATE done)

