<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT-038: Deprecation headers

**Status**: Resolved
**Priority**: medium
**Labels**:
**Assignee**:
**Epic**: epic-api-versioning.md
**Related**:

Git issue: `e25c9ee`

## Resolution

Landed on dev in `310e3de2` (plus placeholder origin `7542b20e` on `api-version-placeholders`). `src/routes/middleware/deprecation-headers.ts` provides `withDeprecationHeaders` / `applyDeprecationHeaders` / `deprecationAfterHandle` (Sunset, Deprecation, Link successor-version, X-API-Deprecated-Version); wired into the v1 barrel behind lazy `API_V1_DEPRECATED === "1"` flag with 11 passing tests.
