<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: admin-templates update-remove lack admin.settings gate

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium

## Summary

src/routes/admin-templates/update.ts and remove.ts do not enforce the admin.settings authorization gate that create/list enforce, so any authenticated caller can PUT/DELETE prompt templates. Found during unit-test-coverage-2 (tests pin 200 for role=user). Security: add the same gate as create/list.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
