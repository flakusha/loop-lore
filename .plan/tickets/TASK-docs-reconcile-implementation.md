# TASK: Reconcile specs + API reference with implementation

**Status:** 🟡 In Progress
**Priority:** medium
**Effort:** Medium
**Epic:** epic-docs-reconciliation.md

## Summary

Audit the most-cited, user-facing docs against actual `src/` and fix confirmed
stale claims (endpoint paths/methods, field names, UI flows).

## Acceptance Criteria

- [ ] Scout audit completed across assets, actors, messages, chat/gallery/
      settings/characters/worlds frontend docs, and `docs/reference/api.md`
- [ ] Confirmed mismatches updated in the docs
- [ ] `docs/reference/api.md` endpoint list matches `src/routes/*.ts`

## Notes

Audit is read-only first (findings), then targeted edits. Only confirmed
mismatches are changed — aspirational/future-marked content is left alone.