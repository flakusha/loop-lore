# BUG: chat: injectNarration silently swallows all errors (silent catch)

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Medium

## Summary

src/chat/service/transitions.ts lines 175-178: injectNarration has a bare catch that swallows all errors including DB failures, violating the no-silent-catch convention. Fix: at minimum log via the structured logger; rethrow or handle DB failures explicitly.

## Root cause (verified 2026-09-05)

The swallowed error is a **foreign-key violation in production**: `injectNarration` inserts `messages.actor_id = "system"` (transitions.ts:177), but `messages.actor_id` is `notNull REFERENCES actors.id` (migration `parts/006_chat.ts`), and **no actor with id `"system"` is ever seeded** — `src/db/seed.ts` seeds only `assistant-default` (character) and the bootstrap admin (user). Tests pass only because they manually insert `{ id: "system" }` (split.test.ts, chats/split.test.ts). Runtime effect: split/reunite VN narration is silently discarded (bare catch at :188-190 masks the FK violation).

Fix direction: resolve a real narrator actor via the `findNarrator` pattern used in `src/chat/service/party.ts` (and `src/story/game-master/narration.ts`), then log/rethrow on any remaining DB failure instead of swallowing. See also BUG-injectnarration-hardcodes-actor-id-system-fk-drops-split-reu.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
