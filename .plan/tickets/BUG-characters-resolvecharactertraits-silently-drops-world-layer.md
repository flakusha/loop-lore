<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: characters: resolveCharacterTraits silently drops world-layer integrity violations

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

## Observed

resolveCharacterTraits checks personality integrity on world-layer traits (line 61: `checkPersonalityIntegrity(row.trait_name, row.trait_category)`) and skips disallowed rows via `continue` (line 64). The returned `violations` array (lines 89-95) is populated ONLY from permanentRows — world-layer violations are silently dropped with no audit/log entry.

## Expected

World-layer integrity violations should be collected into the same `violations` array so callers can audit, surface to the GM, or log them. Silently dropping disallowed world traits hides the policy action.

## Evidence

- src/characters/services/personality-service/resolve.ts:61-65 — world-row integrity check with `continue` skip.
- src/characters/services/personality-service/resolve.ts:89-95 — only permanentRows contribute to violations array.
- reproduction: call resolveCharacterTraits with a world trait whose name/category triggers checkPersonalityIntegrity to return allowed:false. The trait is excluded from resolved/world, but the returned violations array contains only permanent-layer entries; the world violation is invisible.

## Severity

medium

## Fix direction

Collect world-layer violations in the same loop: `if (!lock.allowed) { worldViolations.push(lock); continue; }`. Then merge worldViolations into the returned `violations` array alongside permanent-layer entries. Apply the same change to the location-layer loop for consistency.


## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
