<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: flagContent has TOCTOU race on duplicate flag check - SELECT then INSERT allows concurrent duplicates

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** ✅ Done (closed 2026-09-20) — partial UNIQUE INDEX closes the race
**Priority:** medium
**Effort:** Medium

## Summary

**Where:** src/nsfw/moderation-service/flags.ts:38-50

**Defect (revised 2026-09-20):** flagContent() checks for an existing flag with a SELECT on (content_type, content_id, status IN pending,under_review) at line 41-50 then INSERTs if missing. The pre-check is racy: two concurrent inserts with the same (content_type, content_id, status=pending) can both pass SELECT before either INSERT, creating a duplicate row.

Note: the dedup is content-wide (not per-reporter as the original ticket stated). Multiple reporters flagging the same content collide on the same SELECT — the second is rejected via "Content already flagged" error, but two near-simultaneous requests can both pass.

No DB unique constraint exists on `content_flags` for (content_type, content_id, status) per inspection of the schema.

**Fix sketch:** Add a partial UNIQUE INDEX on (content_type, content_id) WHERE status IN ('pending','under_review') via migration. Replace the SELECT-then-INSERT with INSERT ... ON CONFLICT DO NOTHING RETURNING *, then handle no-return as "already flagged".

## Resolution

Verified 2026-09-20 against dev ada2dd920. The race is real (SELECT at line 41-50, INSERT at line 70 are not transactional). Severity MEDIUM: bypass requires concurrent timing; impact is duplicate `content_flags` rows that downstream queries dedupe in-memory.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
