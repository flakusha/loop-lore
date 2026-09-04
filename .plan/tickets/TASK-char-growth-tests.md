<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: char-growth-tests

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium

## Summary

Unit + integration tests for character growth: schema, validation, integrity interaction, events, prompt section, API, integration pipeline (event → growth log → prompt section for all 4 axes).

## Acceptance Criteria

- [ ] `src/characters/services/growth-service/index.test.ts` — CRUD + confirm/reject
- [ ] `src/characters/services/growth-service/integrity.test.ts` — static mode refuses
- [ ] `src/characters/services/growth-service/events.test.ts` — bridges write entries
- [ ] `src/assistant/prompt/sections/actor-growth.test.ts` — directive emission
- [ ] `src/routes/character-growth.test.ts` — API + role gating
- [ ] `src/characters/integration-growth.test.ts` — end-to-end for 4 axes
