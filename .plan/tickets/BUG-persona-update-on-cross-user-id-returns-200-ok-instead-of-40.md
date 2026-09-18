<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Persona update on cross-user id returns 200 ok instead of 404

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ✅ Resolved (verified fixed on dev; code + regression tests present)
**Priority:** medium
**Effort:** Medium

## Summary

handleUpdatePersona (src/personas/handlers.ts:131) returns 200 {ok:true} when the persona id belongs to another user: PersonasService.update (service.ts:102-120) scopes WHERE id=? AND user_id=? and no-ops, while getById/delete/convertToCharacter surface 404 for the same case. Inconsistent contract hides wrong-id mistakes. Fix: return 404 (or align all handlers), add cross-user update test to handlers.test.ts (existing cross-user tests cover get/delete/convert at :114,:216,:317,:338 but not update :233-297). Also fix stale 200-vs-201 docstring at handlers.ts:199.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [ ] Documentation updated
