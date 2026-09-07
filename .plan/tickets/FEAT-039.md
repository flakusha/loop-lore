<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT-039: OpenAPI Swagger generation

**Status**: Resolved
**Priority**: medium
**Labels**:
**Assignee**:
**Epic**: epic-api-versioning.md
**Related**:

Git issue: `f1b66c6`

## Resolution

Landed on dev in `310e3de2` (plus placeholder origin `7542b20e` on `api-version-placeholders`). `src/routes/v1/openapi.ts` provides `buildVersionedOpenApiSpec` (valid OpenAPI 3.1 envelope, versioned server URL) and `versionedOpenApiPlugin` (`@elysia/openapi`, serves `GET /api/v1/openapi` + `/openapi/json`); mounted in the v1 barrel with passing tests.
