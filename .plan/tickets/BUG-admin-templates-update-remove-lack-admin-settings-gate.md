<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: admin-templates update-remove lack admin.settings gate

**Status:** ✅ Resolved
**Priority:** Medium
**Effort:** Medium

## Summary

src/routes/admin-templates/update.ts and remove.ts do not enforce the admin.settings authorization gate that create/list enforce, so any authenticated caller can PUT/DELETE prompt templates. Found during unit-test-coverage-2 (tests pin 200 for role=user). Security: add the same gate as create/list.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

- Landed in `unit-isolation` (commit `531f7f08`, merged to dev): inline
  `can(ctx.userRole, "admin.settings",)` gate after `requireUserId` in both
  PUT handlers of `src/routes/admin-templates/update.ts` and the DELETE in
  `remove.ts`, mirroring the existing `create.ts` convention (403 +
  `ErrorCode.Forbidden`, i18n message). Auth order: 401 for anonymous
  before 403 for non-admin.
- Tests: `admin-templates-gate.test.ts` pins 403 for non-admin PUT/PUT
  defaults/DELETE and 401 for anonymous; `admin-templates.coverage.test.ts`
  stale test renamed to "update and remove gate non-admin callers" pinning
  403. Full isolated suite green at merge time.
