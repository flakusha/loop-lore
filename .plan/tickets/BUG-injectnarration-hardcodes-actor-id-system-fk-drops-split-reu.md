# BUG: injectNarration hardcodes actor_id system, FK-drops split/reunite narration

**Status:** ✅ Resolved (fixed 2026-09-05)
**Priority:** high
**Effort:** Medium

## Summary

src/chat/service/transitions.ts:166-191 injectNarration inserts messages.actor_id='system'; messages.actor_id is notNull FK->actors.id (migration parts/006_chat.ts:228); seed.ts seeds only assistant-default, no 'system' actor in production. Catch-all (:188-190) swallows FK violation -> VN split/reunite narration silently never appears. Fix: resolve real narrator via findNarrator pattern (party.ts:55-65); stop swallowing; regression test without manual system insert.

## Resolution

Fixed in `injectNarration` (`src/chat/service/transitions.ts`): resolves a real narrator actor (`actor_type="narrator" AND agent_type="narrator"`, mirroring the shadow-note narrator lookup) and inserts with `actor_id = narrator.id`. When no narrator exists it returns early (still non-fatal). The bare `catch {}` is replaced with a structured `getLogger().error(...)` — surfaced but never rethrown (split/reunite must not break the party flow).

Tests: `src/chat/service/transitions.test.ts` — (1) seeds a narrator actor, calls `injectNarration`, asserts a `messages` row with `actor_id === narrator.id` and `content_type="narration"` (no manual `system` actor needed); (2) no narrator → no throw, zero rows. Both pass.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [ ] Documentation updated