# TASK: Auth Register Route

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-auth

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

- [ ] POST /api/auth/register endpoint
- [ ] Email/username validation
- [ ] Password strength requirements
- [ ] Password hashing (bcrypt/argon2)
- [ ] Username availability check
- [ ] Rate limiting on registration
- [ ] Unit tests for registration logic
- [ ] Integration tests for registration flow

## Notes

- Reference `docs/spec/auth-middleware.md` for spec
- Follow existing auth patterns in `src/auth/`
- Add response schema per `TASK-add-response-schemas-remaining-routes.md`
