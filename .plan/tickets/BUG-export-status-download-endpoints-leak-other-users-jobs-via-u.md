<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Export status/download endpoints leak other users jobs via unguessable jobId

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

GET /api/export/status/:jobId and GET /api/export/download/:jobId resolve the in-memory ExportJob by jobId alone and never compare the caller identity against job.userId. ExportJob.userId is written by start.ts but never read for authorization. The jobId is crypto.randomUUID (unguessable), but per authorization policy an unguessable id is not authorization: jobIds leak via status responses, logs, referrer headers, and the SSE completed event (which surfaces downloadUrl). A leaked jobId yields the full account export ZIP (chats, characters, worlds, assets). Fix: read the already-derived ctx.userId/ctx.userRole and 404 (not 403) on ownership mismatch, admin override. Modeled on requests/status.ts.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
