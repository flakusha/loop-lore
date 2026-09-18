<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Frontend — Character Emotion Types & Prompt Modifier Lookup

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** P2 — Medium
**Effort:** Small
**Epic:** epic-character-core-system
**Related:** TASK-actor-emotion-avatars-frontend, TASK-quick-regen-button
**Source:** FE-BE harmonization check, 2026-09-17 — 2 routes in this slice.

## Summary

Wire the emotion-types list and per-emotion prompt modifier lookup so the avatar
regeneration UI can list available emotions and preview the prompt modifier that
will be applied.

## Backend surface

| Method | Path | File |
|--------|------|------|
| GET | `/api/emotions/types` | `src/routes/character-emotion-avatars.ts:147` |
| GET | `/api/emotions/prompt-modifier/:emotion` | `src/routes/character-emotion-avatars.ts:134` |

## Acceptance Criteria

- [ ] Emotion picker UI calls GET `/api/emotions/types` on mount
- [ ] Selecting an emotion previews the prompt modifier via GET `/api/emotions/prompt-modifier/:emotion`
- [ ] Response cached per-emotion to avoid N+1 on every avatar render
- [ ] `bun run scripts/check-fe-be-harmonization.ts` exits 0
