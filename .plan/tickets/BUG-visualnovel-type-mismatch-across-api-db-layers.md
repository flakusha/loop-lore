<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: visualNovel type mismatch across API/DB layers

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

The visualNovel field is validated as Boolean in the API schema (src/validation/schemas/chat.ts:33) but stored as Number in the DB schema (src/validation/db-schemas.ts). Backend updateChat converts params.visualNovel ? 1 : 0 but the type contract is inconsistent across layers. The frontend sends visualNovel as Boolean but the backend stores it as integer 0/1 in the visual_novel column.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
