<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: NSFW Intimacy Interface

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** In Progress
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
- [ ] Character positioning display (out of Phase-1 scope here — not implemented)
- [x] Action selection with descriptions
- [x] Scene progression controls (consent confirm/cancel, back, continue, retry, close)
- [ ] Mobile responsive (layout classes reused from the battle panel; not verified)

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
