<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TEST: no e2e spec covers auth flows (login/logout/token expiry)

**Status:** Open
**Priority:** high
**Effort:** Medium
**Area:** users (auth)
**Source:** reconcile review (Scout Batch B — ISSUE-006)

## Evidence

`tests/e2e/flows/` contains admin-dashboard specs but no spec for JWT login, logout, token expiry, solo-user fallback, or auth failure paths.

## Impact

Auth regression undetected by CI — any auth bug (broken JWT validation, token expiry mishandling, solo-user fallback failure) would not be caught by e2e.

## Fix

Add `tests/e2e/flows/auth.flows.ts`:

- `login with valid credentials → JWT cookie set`
- `login with invalid credentials → 401`
- `expired JWT → 401, solo-user fallback or redirect`
- `logout → cookie cleared`
- `missing Authorization header → 401`

## Verification

- Run `E2E_SAFEGUARD=1 bun test tests/e2e/flows/auth.flows.ts`

## Acceptance Criteria

- [ ] All 5 auth scenarios covered
- [ ] Fails if JWT expires or solo-user misconfigured
