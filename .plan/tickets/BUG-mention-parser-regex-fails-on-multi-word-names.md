<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: mention-parser regex fails on multi-word names

**Status:** ✅ Resolved
**Priority:** medium
**Effort:** Medium

## Summary

parseMentions regex fails for names with spaces (e.g. @Luna Maxim) and prefix-match determinism edge cases (mention-parser.ts). Boundary tests written (test-coverage-tiers commit 31383174aa6ab1f21ca5a741f7ba1acc763bfa41) but 2 tests still fail.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

Greedy capture `@([A-Za-z0-9_-]+(?:\s+[A-Za-z0-9_-]+)*)` swallowed trailing prose (`@Luna hello` → name `"Luna hello"`), poisoning exact/prefix resolution and the boundary suite's `parseMentions("@Luna hello")` → `"Luna"` assertion.

Fix: single-token capture `/@([A-Za-z0-9_-]+)/` in `src/group-chat/mention-parser.ts`. Multi-word display names still resolve end-to-end because consumers (`extractMentionedActorIds` in `messages/post.ts` and `turn-selector.ts`) resolve the token through `resolveMention`, whose `startsWith` prefix matching resolves `@Dark Knight` → `"Dark"` → participant `"Dark Knight"`. Tests updated to the single-token contract (`mention-parser.test.ts` 13→21 tests incl. multi-word resolution via prefix) and boundary suite adopted into `mention.boundary.test.ts` — the coverage suite's contradictory "unique prefix deterministically by actorId" case (two participants sharing prefix `L` expected deterministic pick while the very next test asserts ambiguity → null) is corrected to an actually-unique prefix, preserving the documented ambiguity → null contract. 33/33 pass (mention-parser + boundary), 40/40 messages route tests green.
