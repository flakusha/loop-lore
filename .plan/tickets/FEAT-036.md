<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT-036: Response envelope version

**Status:** closed
**Priority:** medium
**Effort:** Medium
**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status**: closed
**Priority**: medium
**Labels**:
**Assignee**:
**Epic**: epic-api-versioning.md
**Related**: FEAT-035, FEAT-037

Git issue: `a7e62d9`

## Resolution

Phase 0 was already complete before this ticket: `src/routes/http-utils/`
injects `meta.api_version` (constant `API_VERSION = "1"`) into every
response helper — `jsonResponse`, `jsonError`, `jsonValidationError`,
`jsonPaginated`, `jsonCreated`, and the common 40x factories.

Gap found and fixed on branch `api-versioning-feat035`: the Elysia
`onError` path in `src/validation/middleware.ts` returned envelopes
without meta (`VALIDATION` 422, route `NOT_FOUND` 404, `PARSE` 400,
service-layer `NotFoundError`/`ForbiddenError`, 500 fallback, and the
`unauthorized`/`forbidden`/`notFound` guard helpers). All now include
`meta: { api_version: API_VERSION }`.

Verified by live-app probes: success (200), validation (422), unknown
resource (404) envelopes on `/api/v1/*` all carry `meta.api_version: "1"`.
Targeted tests: 231 pass / 0 fail across `src/validation/`,
`src/routes/http-utils/`, `src/routes/entity-routes/`, `src/routes/v1/`,
`src/routes/middleware/`.
