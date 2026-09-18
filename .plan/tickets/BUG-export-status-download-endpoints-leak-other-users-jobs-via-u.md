<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Export status/download endpoints leak other users jobs via unguessable jobId

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ✅ Resolved (commit 242b78b44)
**Priority:** high
**Effort:** Medium

## Summary

GET /api/export/status/:jobId and GET /api/export/download/:jobId resolve the in-memory ExportJob by jobId alone and never compare the caller identity against job.userId. ExportJob.userId is written by start.ts but never read for authorization. The jobId is crypto.randomUUID (unguessable), but per authorization policy an unguessable id is not authorization: jobIds leak via status responses, logs, referrer headers, and the SSE completed event (which surfaces downloadUrl). A leaked jobId yields the full account export ZIP (chats, characters, worlds, assets). Fix: read the already-derived ctx.userId/ctx.userRole and 404 (not 403) on ownership mismatch, admin override. Modeled on requests/status.ts.

## Resolution

Fixed by commit `242b78b44` (fix(export): enforce ownership on status/download endpoints):

- `src/routes/export-sse/start.ts` — unify identity source to global `ctx.userId` derive (fallback `resolveUserIdFromRequest` for direct test mounts)
- `src/routes/export-sse/status.ts` — ownership guard after `!job` 404: `job.userId !== userId && userRole !== "admin"` → 404
- `src/routes/export-sse/download.ts` — identical ownership guard before the `status !== "completed"` check
- `src/routes/export-sse/jobs.coverage.test.ts` — 4 regression tests (cross-user status/download → 404, admin read → 200, unauthenticated known-job → 404)

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [ ] Documentation updated
