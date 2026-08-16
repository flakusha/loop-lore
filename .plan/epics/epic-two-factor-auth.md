<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Two-Factor / Multi-Factor Authentication

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Issue:** `280c355`
**Type:** Feature Epic

## Summary

Add two-factor (2FA) and multi-factor (MFA) authentication support. Enhance security with TOTP, SMS, e-mail verification, and hardware key support.

## Scope

### TOTP (Time-based One-Time Password)

- Google Authenticator / Authy support
- QR code generation
- Backup codes generation and storage
- TOTP verification flow

### SMS Verification

- SMS code delivery
- Code verification
- Rate limiting and abuse prevention

### E-mail Verification

- E-mail code delivery
- Code verification
- E-mail change verification

### Hardware Keys (WebAuthn/FIDO2)

- YubiKey support
- Platform authenticators (Touch ID, Windows Hello)
- Registration and authentication flows

### Recovery

- Backup codes generation
- Recovery key generation
- Account recovery flow

## Tasks

- [ ] Design 2FA/MFA architecture
- [ ] Add TOTP support (generation, verification)
- [ ] Add backup codes system
- [ ] Add SMS verification (optional)
- [ ] Add e-mail verification
- [ ] Add WebAuthn/FIDO2 support
- [ ] Create 2FA setup UI
- [ ] Create recovery flow UI
- [ ] Add 2FA enforcement options (admin)
- [ ] Write tests for all 2FA methods

## Files

- `src/auth/` — authentication modules (expand existing)
- `src/auth/totp.ts` — TOTP generation and verification
- `src/auth/sms.ts` — SMS verification
- `src/auth/email.ts` — E-mail verification
- `src/auth/webauthn.ts` — WebAuthn/FIDO2 support
- `src/auth/recovery.ts` — Backup codes and recovery
- `src/routes/auth.ts` — auth routes (expand)
- `src/frontend/` — 2FA setup UI components
- `docs/spec/2fa.md` — 2FA specification

## Linked Tasks

- TASK-2fa-mfa.md
