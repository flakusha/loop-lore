<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Auth Register Route

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Status Note:** 2026-11-09 reconcile: route shipped (`src/routes/auth/register.ts:67` `handleRegister` — username 3-32 validation, password >= 6, bcrypt/argon2 `hashPassword`, `insertUnique` username race guard, `registerLimiter` rate limit, transactional user+actor+key insert), mounted at `src/routes/auth/index.ts:98,106`, view `src/views/register.html` linked from login (`login.html:38`) and `/register` redirect (`elysia-app.ts:340`). Remaining: no CAPTCHA/email-verification (explicitly optional in ticket).
**Priority:** medium
**Effort:** Medium
**Epic:** (none — proposed epic never materialized)
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability
**Epic Note:** original value "epic-auth" preserved 2026-10-23; no epic file exists.

## Summary

POST /api/auth/register route: user registration, password hashing, initial setup. From `docs/spec/auth-middleware.md`.

## Scope

### Registration Flow

- Email/username validation
- Password strength requirements
- Password hashing (bcrypt/argon2)
- Initial profile setup

### Validation

- Email format validation
- Username availability check
- Password confirmation
- Terms acceptance

### Security

- Rate limiting on registration
- CAPTCHA/bot protection
- Email verification (optional)

## Acceptance Criteria

- [x] POST /api/auth/register endpoint
- [x] Email/username validation
- [x] Password strength requirements
- [x] Password hashing (bcrypt/argon2)
- [x] Username availability check
- [x] Rate limiting on registration
- [x] Unit tests for registration logic
- [x] Integration tests for registration flow

## Notes

- Reference `docs/spec/auth-middleware.md` for spec
- Follow existing auth patterns in `src/auth/`
- Add response schema per `TASK-add-response-schemas-remaining-routes.md`
