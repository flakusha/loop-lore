<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Modality template PATCH classifies DB read failures as 400 with raw exception message

**Status:** Not Started
**Priority:** low
**Effort:** Medium

**Summary:**

Evidence (approved finding 8, P3; .tmp/concern-dev-2026-10-07.md, .tmp/concern-checkrunner.md): src/routes/templates/modality.ts:152-167 (introduced by 541534087, the code twin replayed as 21dde8b86) — during the jscpd dedupe the ownership pre-check (ownedMatchingRow + 404) moved INSIDE the try/catch; the pre-image 541534087^ ran it outside (the refactor deleted the duplicate outer copy but kept the survivor inside). The catch at modality.ts:162-167 returns jsonError({ message: error.message ?? Invalid template update, status: HttpStatus.BadRequest }). A server-side failure of the pre-check read (SQLite/Kysely error, e.g. database is locked under this stack's write concurrency) now answers 400 — a client-error classification for a server fault — with the RAW exception message echoed to the client, bypassing the no-leak policy: pre-image the same failure propagated to src/elysia-app.ts:86 onError -> src/validation/middleware.ts:102-118 'Unknown errors -> 500' generic envelope ('Never leak err.message to the client: SQL errors, file paths, and stack frames can disclose schema, infrastructure topology, or secrets'); danger-zone.ts's boundary comment documents the contract (errors are translated to a 500 response with a logged cause). Live for both modalities: src/routes/templates/index.ts:47-48 mounts modalityTemplateRoutes(video) and modalityTemplateRoutes(audio), so PATCH /api/templates/video|audio/:id is reachable. No test pins the error path. Fix: hoist the pre-check back out of the try (ownedMatchingRow + notFound before any write; keep only updateTemplate inside) so read failures propagate to the boundary (500 + generic envelope) while update failures keep the 400 mapping.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
