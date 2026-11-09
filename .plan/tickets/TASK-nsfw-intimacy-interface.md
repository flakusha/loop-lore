<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: NSFW Intimacy Interface

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Priority:** P0 — Critical
**Effort:** Medium
**Type:** Feature Task
**Tags:** nsfw, frontend, ui, intimacy
**Epic:** epic-nsfw-ui

## Summary

Intimacy interaction UI for NSFW features.

## Core Features

- Intimacy scene selection
- Character positioning
- Action selection
- Scene progression

## Acceptance Criteria

- [x] Intimacy scene selection
- [x] Character positioning display (positionSelect phase: `side-by-side` / `facing` / `embrace-hold`; `src/frontend/nsfw/intimacy-types.ts`; carried on the apply wire `context` `near/facing:<id>`, 2026-11-09)
- [x] Action selection with descriptions
- [x] Scene progression controls (consent confirm/cancel, back, continue, retry, close)
- [x] Mobile responsive (`.nsfw-intimacy-position` stacks under the 480px breakpoint, `src/public/css/app.css`; 2026-11-09)

## Review decisions

### Locale-dependent `actionName` history (review finding, 2026-11-06)

The client sends `actionName: actionLabel(action)` (localized display
string, `intimacy-api.ts`) and the server persists it verbatim into
`character_intimacy.action_history[].actionName`
(`src/rpg/intimacy/service/actions.ts`). History rows are therefore
locale-dependent: the same action reads differently per locale, and a
locale change rewrites the meaning of stored rows. `actionId` is already
persisted alongside, so nothing is lost — localization at render time can
recover the canonical name.

Decision: locale-dependent history ACCEPTED for Phase 1. The catalog is
closed (six actions), history is display-only (no reader joins on
`actionName`), and persisting the label keeps Phase-1 reads trivial.

Recommendation (not implemented): persist the stable `actionId` and
localize at render (`actionLabel(findCatalogAction(row.actionId))` with
the stored `actionName` as fallback for unknown/retired ids). Do this
when history gains readers (search, export, cross-locale views) or the
catalog grows past Phase 1.

## Files to Create

- `src/frontend/nsfw/intimacy-interface.ts`
- `src/frontend/nsfw/intimacy-scene.ts`

**Resolved:** 2026-11-06 registry-driven close: git issue ee54c1c (registry tip: 6bff65be4 Konstantin Fedotov Close issue)
