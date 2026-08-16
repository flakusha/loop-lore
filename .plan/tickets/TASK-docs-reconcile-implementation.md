<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Reconcile specs + API reference with implementation

**Status:** ✅ Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-docs-reconciliation.md

## Summary

Audit the most-cited, user-facing docs against actual `src/` and fix confirmed
stale claims (endpoint paths/methods, field names, UI flows).

## Acceptance Criteria

- [x] Scout audit completed across assets, actors, messages, chat/gallery/
      settings/characters/worlds frontend docs, and `docs/reference/api.md`
- [x] Confirmed mismatches updated in the docs
- [x] `docs/reference/api.md` endpoint list matches `src/routes/*.ts`

## Notes

Audit is read-only first (findings), then targeted edits. Only confirmed
mismatches are changed — aspirational/future-marked content is left alone.

**Completed (2026-08-14):**
1. **Broken links:** 17 internal markdown links fixed across `docs/README.md` +
   `docs/spec/{build-deploy,battle-integration,nsfw-integration}.md` — 15
   repointed to real specs, 2 dropped (no matching spec: `content-management.md`,
   `housing.md`). `check-md-links`: 196 files, all resolve.
2. **api.md reconciliation:** Full audit of `src/routes/*.ts` — api.md rewritten
   from 26 endpoints to 100+ endpoints matching actual route registrations.
   All routes confirmed under `/api/v1/` prefix. Duplicate `## Authentication`
   renamed to `## Authentication Endpoints`.
3. **Frontend docs audit:** Scout confirmed assets/actors/messages/chats/
   worlds routes match documented frontend integration points — no stale claims.