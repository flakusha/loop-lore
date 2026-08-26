<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-e2e-auth-flows: Browser e2e auth, registration, join/invite, redirection flows

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Type:** Feature Task / Test Infrastructure
**Tags:** testing, e2e, browser, playwright, auth
**Epic:** epic-testing-qa
**Parent:** TASK-BROWSER-E2E-COVERAGE-EXPANSION-PLAYWRIGHT-INTEGRATION (umbrella)

## Summary

Browser-level coverage for the four zero-coverage flow topics that gate everything else: registration, authorization/login, join/invite, and redirection — including a regression guard for the auth redirect loop that currently fails `auth-flow`.

## Context

API-level e2e coverage exists for all four topics (`tests/e2e/flows/*.test.ts`); **browser/UI-level coverage is ZERO**. Current `auth-flow.browser.ts` only tests invalid login; successful login is untested. The only failing suite today is `auth-flow`, blocked by an auth redirect loop.

### Auth redirect loop (P0 blocker)

Under `auth.required=true`, something on `/views/login` (loaded without a session) receives a 401; `feFetch`/htmx's 401 handler runs `location.assign('/views/login?redirect=' + encodeURIComponent(location.pathname + location.search))` (`src/frontend/fe-fetch.ts:50-53`). Already on login, the next load repeats — each hop re-encodes the previous `?redirect=` value, producing an infinite growing chain (`?redirect=%2Fviews%2Flogin%3Fredirect%3D%252Fviews%252Flogin...`). Client-side loop, not a server view gate. Tracked as `TASK-PLAN-E2E-STABILIZATION`.

## Tasks

### Topic 8 — Redirection

- [ ] Fix the 401 redirect loop: skip the 401-redirect when already on `/views/login` (and `/views/register`), or exempt login-page requests (`src/frontend/fe-fetch.ts`, `src/routes/views.ts`). _(TASK-PLAN-E2E-STABILIZATION)_
- [ ] `redirection.browser.ts`: unauthenticated `/` → login; authed `/` → chat. `/views/chat.html` → `/views/chat`. Unknown `/views/xyz` → `/views/`. **Regression guard: assert no infinite `?redirect=` growth on `/views/login`.**

### Topic 2 — Registration flow

- [ ] `register-flow.browser.ts`: navigate `/views/register` → fill → submit → assert redirect to login/chat + user exists via API.
- [ ] Duplicate-username → `register-error` swap. Registration-closed config (`config.auth.registrationOpen`, 3/hr rate limit via `src/routes/auth.ts` `handleRegister`) → error shown.

### Topic 3 — Authorization flow

- [ ] Successful login (valid `seedUsers` creds → submit → redirect `/views/chat`; session cookie set).
- [ ] Demo-login click → htmx swap to authed view.
- [ ] Logout → lands on login, authed API calls 401.
- [ ] Admin view: seed `e2eadmin`; admin sees `/views/admin` (`admin-gate.ts` `adminViewGuard`); non-admin gets 302 → `/`.

### Topic 4 — Join/invite flow

- [ ] `world-invites-flow.browser.ts`: world-edit → Invites tab (`world-invites.ts`: `show-create-invite-btn`, `submit-create-invite`, `invite-max-uses`, `copy-invite-code`, `revoke-invite`) → create invite (set max-uses) → assert code renders → copy code → join via `/views/` join UI (if present) or via API with copied code → assert membership.
- [ ] Chat invites have **no browser UI** (API-only, `routes/invites.ts`) — document as known gap in this ticket's outcome notes.

## Files

- `tests/e2e/flows/browser/auth-flow.browser.ts`, `register-flow.browser.ts`, `redirection.browser.ts`, `world-invites-flow.browser.ts`
- `src/frontend/fe-fetch.ts` and/or `src/routes/views.ts` — login/register exempt from auth-required view redirect (P0 blocker)
- Source surfaces: `src/views/register.html` + `components/auth-form-fields.html` (`register-submit`, `register-error`, `username-input`, `password-input`), `views/login.html` (`demo-login`, `signup-link`), `src/middleware/auth/`, `admin-gate.ts`

## Dependencies

- Parent hub: `TASK-BROWSER-E2E-COVERAGE-EXPANSION-PLAYWRIGHT-INTEGRATION.md`
- **TASK-e2e-playwright-harness must land first** (helpers, page isolation).
- Siblings: TASK-e2e-view-expansion (admin-guarded views overlap), TASK-e2e-state-contracts.

## Acceptance Criteria

- [ ] `auth-flow.browser.ts` green (no redirect loop)
- [ ] Register + successful-login + demo-login + logout browser flows green
- [ ] `redirection.browser.ts` green including no-redirect-loop regression guard
- [ ] `world-invites-flow.browser.ts` green; chat-invite gap documented
