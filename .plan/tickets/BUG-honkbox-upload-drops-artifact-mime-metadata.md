<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Honkbox upload drops artifact MIME metadata

**Status:** In Progress
**Priority:** high
**Effort:** Medium
**Epic:** epic-platform-integrations
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Honkbox records artifact media type only from `x-artifact-content-type`; `putHonkboxArtifact` sends only HTTP `Content-Type`, so GLB/PNG uploads fall back to `application/octet-stream`. The upload body must stay octet-stream (honkbox treats multipart as chunked), and the artifact header must carry a bare `type/subtype` (honkbox rejects parameters).

Acceptance: upload sends `Content-Type: application/octet-stream` plus `x-artifact-content-type: <bare type/subtype>`; parameters are stripped and invalid MIME is rejected before I/O; byte cap, bearer auth, timeout and descriptor parsing are unchanged; mock-fetch tests assert both headers.

**Context:**

No production caller uses `putHonkboxArtifact` yet (`index.ts` export + test only); effect arrives with the first upload caller. Fix is required before that caller lands so stored descriptors carry usable media types.

**Acceptance Criteria:**

- [x] Send bare `x-artifact-content-type` and octet-stream body headers
- [ ] Tests passing
- [ ] Documentation updated
