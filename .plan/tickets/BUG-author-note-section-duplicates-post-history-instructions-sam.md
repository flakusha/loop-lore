<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Author-note section duplicates post-history instructions (same field)

**Status:** ✅ Resolved (verified 2026-09-07; documented dual-injection contract)
**Priority:** high
**Effort:** Medium

## Summary

authorNoteSection and postHistorySection both gated on ctx.actor.post_history_instructions, inject same text as <author_note> and <post_history>. No distinct author_note field. Give author-note its own field or drop duplicate.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Resolution

Ticket claim is a misreading of the by-design dual-injection pattern
(SillyTavern pre/post-history-note convention). Both sections read
`actor.post_history_instructions` intentionally; they wrap the same
text in different XML tags (`<author_note>` vs `<post_history>`) and
emit at different roles (`system` at top of prompt vs `user` at end
of prompt).

- `src/assistant/prompt/sections/author-note.ts` — emits
  `role: "system"` near the top of the prompt.
- `src/assistant/prompt/sections/post-history.ts` — emits
  `role: "user"` after `chatHistorySection` (the registry comment at
  `src/assistant/prompt/registry.ts:61-66` documents this intent).
- Registry order (`src/assistant/prompt/registry.ts:38`) places
  `authorNoteSection` before `chatHistorySection` and
  `postHistorySection` after.

Pin regression coverage added in
`src/assistant/prompt/sections/author-note.test.ts` (7 cases) so the
two sections can't silently diverge or be merged by a future
refactor:
1. `<author_note>` role=system rendering + enable gating;
2. `<post_history>` role=user rendering + enable gating;
3. Cross-check that the source field is shared, but the role + XML
   tag differ (so downstream consumers can distinguish by tag).

Adding a separate `author_note` DB column would require a new
schema migration and the user has not requested it. If a future
ticket wants to split the two fields, this test contract documents
the current dual-source assumption and will catch the regression
risk at migration time.
