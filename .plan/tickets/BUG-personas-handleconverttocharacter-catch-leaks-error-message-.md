<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: personas handleConvertToCharacter: catch leaks error.message and always returns 404

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

## Observed
handleConvertToCharacter's catch (line 215-220) returns 404 NotFound for ANY error and echoes `error.message` to the HTTP body. service.convertToCharacter throws Error('Persona not found') for missing rows, but ALSO propagates DB errors (unique constraint on uid, FK violation, etc.). Those get returned to clients as 404 'Persona not found' OR with the raw DB error message verbatim, hiding infrastructure details (and possibly leaking schema info to attackers).

## Expected
Distinguish 'Persona not found' (404) from other errors (500 with a generic message). Log the underlying error with getLogger().error for ops. Do not echo raw error.message to the HTTP body.

## Evidence
- src/personas/handlers.ts:215-220 — catch returns `{ message: error.message ?? 'Conversion failed', status: 404 }`.
- src/personas/service.ts:212 — service throws Error('Persona not found') for missing persona.
- reproduction: trigger a DB unique-constraint error from convertToCharacter's actor insert (e.g., concurrent uid collision). Client sees 404 + raw error text. Operators see nothing in logs.

## Severity
medium

## Fix direction
Narrow the catch: `if (error instanceof Error && error.message === 'Persona not found') return jsonError({ message: 'Persona not found', status: 404, code: ErrorCode.NotFound });`. Otherwise log via getLogger().error() and return 500 with a generic message.


## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
