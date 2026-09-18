<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: personas setDefault: silently succeeds for invalid personaId with no existence check

**Status:** ✅ Resolved (batch 2)
**Priority:** medium
**Effort:** Medium
**Summary:** (see ## Summary)
**Context:** (see ## Observed / ## Evidence)
**Acceptance Criteria:** (see ## Acceptance Criteria)

## Summary

## Observed

PersonasService.setDefault (service.ts:165) does not check that the persona exists or is owned by userId. Two UPDATE statements execute harmlessly: the first unsets all defaults (0 if no prior default), the second matches 0 rows. No Error thrown. Compare update() (service.ts:107-132) which correctly throws Error('Persona not found') when numUpdatedRows === 0. setDefault is inconsistent with the rest of the service.

## Expected

setDefault should throw an Error on invalid personaId / wrong owner so callers (including any future handler) can surface 404. Alternatively, add a handleSetDefault route + handler that performs the ownership check and returns 404 on missing rows.

## Evidence

- src/personas/service.ts:165-180 — setDefault performs no ownership/existence check.
- src/personas/service.ts:107-132 — update() demonstrates the correct pattern.
- src/personas/handlers.ts — no handler for setDefault exists; the function is unreachable from HTTP.
- reproduction: service.setDefault('nonexistent-id', 'user-id') returns void, no throw. The user's default persona is unchanged but no error feedback exists.

## Severity

medium

## Fix direction

Add an existence check: `const owned = await this.db.selectFrom('personas').select('id').where('id','=',id).where('user_id','=',userId).executeTakeFirst(); if (!owned) throw new Error('Persona not found');` BEFORE the UPDATE statements. This matches the update() pattern and gives handlers a way to surface 404.


## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [ ] Documentation updated
