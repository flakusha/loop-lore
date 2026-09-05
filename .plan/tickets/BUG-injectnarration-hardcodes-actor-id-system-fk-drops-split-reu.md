<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: injectNarration hardcodes actor_id system, FK-drops split/reunite narration

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

src/chat/service/transitions.ts:166-191 injectNarration inserts messages.actor_id='system'; messages.actor_id is notNull FK->actors.id (migration parts/006_chat.ts:228); seed.ts seeds only assistant-default, no 'system' actor in production. Catch-all (:188-190) swallows FK violation -> VN split/reunite narration silently never appears. Fix: resolve real narrator via findNarrator pattern (party.ts:55-65); stop swallowing; regression test without manual system insert.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
