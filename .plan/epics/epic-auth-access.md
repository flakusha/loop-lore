<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Authorization & Access Control

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** High
**Type:** Foundation Epic
**Tags:** auth, access, authorization, mfa, security, frontend

## Summary

Authorization and access control for the application. Covers user registration, login, two-factor/MFA authentication, encryption-based access management, message-level access checks, and authoring ownership. All P2-E tickets are children of this epic.

## Scope

### Registration & Login

- `POST /api/auth/register` route (currently not implemented — `src/routes/auth.ts` has the backend, frontend pages missing)
- Registration form with email/username validation, password strength, terms acceptance
- Login form with htmx submission
- Password hashing (bcrypt/argon2)
- Rate limiting and CAPTCHA/bot protection

### Two-Factor / Multi-Factor Authentication

- TOTP support (Google Authenticator / Authy)
- QR code generation for enrollment
- Backup codes
- SMS verification (optional)
- Email verification flow
- Hardware key (WebAuthn/FIDO2) support
- MFA enrollment and management UI
- Provisioning semantics (verified channels, unlock ladder, messenger/e-mail OTP transports, anti-takeover): `epic-two-factor-auth.md` + `epic-auth-channel-provisioning.md`

### Access Control

- Message-level access checks (read/write permissions)
- Encryption status display in access control UI
- Authoring/creation ownership indicators
- Reaction access gating
- Role-based feature visibility (based on `GmConfig.assistantRole`)

### Cross-System Integration

- `src/frontend/fe-fetch.ts` — CSRF + session token injection, 401 redirect (auth infrastructure)
- `src/frontend/alpine/admin-users.ts` — admin role editing and user management
- `src/routes/auth.ts` — existing auth route with register/login endpoints
- `src/frontend/browser-crypto.ts` — browser-side AES for encryption status display

## Related Epics

- `epic-two-factor-auth.md` — existing 2FA/MFA design spec; this epic implements the frontend and integration
- `epic-auth-channel-provisioning.md` — factor binding lifecycle, login/unlock provisioning over messenger, e-mail and federated channels
- `epic-chat-lifecycle-moderation.md` — message access checks tie into chat moderation
- `epic-character-core-system.md` — authoring ownership ties into character/core system

## Tickets

- [`TASK-auth-register-route.md`](TASK-auth-register-route.md) — register route + frontend form
- [`TASK-two-factor-multi-factor-auth.md`](TASK-two-factor-multi-factor-auth.md) — MFA with TOTP/SMS/email/hardware key
- [`TASK-encryption-access-management.md`](TASK-encryption-access-management.md) — encryption + access management display
- [`TASK-dedupe-message-access-checks.md`](TASK-dedupe-message-access-checks.md) — message access check UI
- [`TASK-fix-message-reactions-access.md`](TASK-fix-message-reactions-access.md) — reaction access gating in UI
- [`TASK-authoring-creation.md`](TASK-authoring-creation.md) — authoring ownership indicators

## Acceptance Criteria

- [ ] `POST /api/auth/register` route functional with frontend registration page
- [ ] Login form with htmx submission using `feFetch` (`src/frontend/fe-fetch.ts`)
- [ ] TOTP support with QR code generation and enrollment UI
- [ ] Backup codes system with fallback mechanisms
- [ ] Message-level access check UI (inline denied feedback)
- [ ] Encryption status visible in access control display
- [ ] Authoring/creation ownership indicators on content
- [ ] Reaction UI respects access gating
- [ ] All TypeScript typechecks pass
- [ ] Unit tests for auth logic and access checks

## Files to Create/Modify

| File                          | Action                                       |
| ----------------------------- | -------------------------------------------- |
| `src/views/register.ts`       | Create — registration page                   |
| `src/views/login.ts`          | Create or modify — login page                |
| `src/frontend/pages/auth.ts`  | Create — auth page wiring                    |
| `src/frontend/alpine/auth.ts` | Create — Alpine.js auth state                |
| `src/routes/auth.ts`          | Modify — ensure register endpoint functional |
| `src/frontend/fe-fetch.ts`    | Modify — extend for auth flow needs          |

## Implementation Phases

### Phase 1: Registration & Login

- Build registration form page (`src/views/register.ts`)
- Build login form page with htmx (`src/views/login.ts`)
- Wire `feFetch` auth flow with CSRF + session tokens
- Ensure `POST /api/auth/register` works end-to-end

### Phase 2: MFA

- TOTP enrollment with QR code (`TASK-two-factor-multi-factor-auth.md`)
- Backup codes
- MFA management UI in settings

### Phase 3: Access Control

- Message access check UI (`TASK-dedupe-message-access-checks.md`)
- Encryption status display (`TASK-encryption-access-management.md`)
- Authoring ownership indicators (`TASK-authoring-creation.md`)
- Reaction access gating (`TASK-fix-message-reactions-access.md`)

### Phase 4: Polish

- Cross-system integration tests
- TypeScript typecheck

## Notes

- `src/routes/auth.ts` already has register/login backend logic — the gap is frontend pages and MFA UI
- `feFetch` (`src/frontend/fe-fetch.ts`) handles CSRF + session tokens + 401 redirect — use this as the auth foundation
- Admin user management (`admin-users.ts`) already has role editing — extend for MFA management
- This epic blocks multi-user deployment — no safe system without registration, MFA, and access checks
