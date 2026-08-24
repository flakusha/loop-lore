# BUG: Author-note section duplicates post-history instructions (same field)

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

authorNoteSection and postHistorySection both gated on ctx.actor.post_history_instructions, inject same text as <author_note> and <post_history>. No distinct author_note field. Give author-note its own field or drop duplicate.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
