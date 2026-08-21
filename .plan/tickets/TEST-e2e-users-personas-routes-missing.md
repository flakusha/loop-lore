<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TEST: no e2e spec covers /api/users/\* or /api/personas/\* routes

**Status:** Open
**Priority:** medium
**Effort:** Medium
**Area:** users/personas
**Source:** reconcile review (Scout Batch B — ISSUE-007)

## Evidence

`tests/e2e/` has no spec for user management CRUD or persona CRUD. Unit tests exist in `src/personas/service.test.ts` (15 tests) but no integration/browser test.

## Impact

User management and persona CRUD have no end-to-end coverage; regression in user deletion, persona conversion, or settings sync would go undetected.

## Fix

Add `tests/e2e/flows/users.flows.ts` and `tests/e2e/flows/personas.flows.ts`:

**users.flows.ts:**
- `GET /api/users/me` → 200, shape `{ id, username, role }`
- `PUT /api/users/me/settings` → 200, settings updated
- `DELETE /api/users/:id` (admin) → 200, user deleted
- `DELETE /api/users/:id` (non-admin) → 403

**personas.flows.ts:**
- `POST /api/personas` → 201, persona created
- `GET /api/personas/:id` (owner) → 200
- `PATCH /api/personas/:id` (owner) → 200
- `DELETE /api/personas/:id` (non-owner) → 403 (see BUG-users-persona-handlers-horizontal-priv-esc)
- `POST /api/personas/:id/convert-to-character` → 200

## Verification

- Run `E2E_SAFEGUARD=1 bun test tests/e2e/flows/users.flows.ts tests/e2e/flows/personas.flows.ts`

## Acceptance Criteria

- [ ] All user/persona CRUD paths covered
- [ ] Authz regressions fail CI
