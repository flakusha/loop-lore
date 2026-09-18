<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: personas handleUpdatePersona: catch maps ANY thrown error to 404 'Persona not found'

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Summary:** (see ## Summary)
**Context:** (see ## Observed / ## Evidence)
**Acceptance Criteria:** (see ## Acceptance Criteria)

## Summary

## Observed

handleUpdatePersona wraps service.update in a bare `catch { ... }` block (line 165) that returns 404 'Persona not found' regardless of the error type. service.update throws Error('Persona not found') for missing rows (correct path), but ALSO propagates DB constraint violations, serialization errors, and connection failures. All of those are silently misclassified as 404, hiding infrastructure problems from operators and clients.

## Expected

The handler should distinguish 'Persona not found' (404) from any other error (500). Infrastructure errors must surface to operators via logs.

## Evidence

- src/personas/handlers.ts:165-167 — bare `catch { return jsonError({ message: 'Persona not found', status: HttpStatus.NotFound, ... }); }`.
- src/personas/service.ts:130 — service.update throws Error('Persona not found') only when numUpdatedRows === 0.
- reproduction: trigger a DB constraint error inside service.update (e.g., name length overflow, FK violation). The catch returns 404 'Persona not found' to the client. Server logs show no detail because nothing was logged.

## Severity

medium

## Fix direction

Narrow the catch: `catch (error) { if (error instanceof Error && error.message === 'Persona not found') { return jsonError({ message: 'Persona not found', status: HttpStatus.NotFound, code: ErrorCode.NotFound }); } getLogger().error('persona update failed', { error }); return jsonError({ message: 'Internal server error', status: HttpStatus.InternalServerError, code: ErrorCode.InternalServerError }); }`.


## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
