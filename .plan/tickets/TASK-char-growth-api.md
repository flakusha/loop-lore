<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: char-growth-api

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Small

## Summary

CRUD routes under `/api/character-growth`: GET/PATCH `/arc`, GET `/growth-log`, POST `/growth-log/:entryId/confirm`, POST `/growth-log/:entryId/reject`. Extend `src/routes/characters/update.ts` PATCH handler to accept `growth_mode` + `llm_assist_enabled`. Role-gated via `requireActorAccess`.

## Acceptance Criteria

- [ ] All endpoints registered in `register-plugins.ts`
- [ ] `GrowthServiceError` mapped to HTTP status (409 for static/integrity, 404 not_found, 400 invalid_input)
- [ ] `requireActorAccess` enforced on every mutation
