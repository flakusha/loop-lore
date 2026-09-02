<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Two-Factor / Multi-Factor Authentication

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-two-factor-auth

## Summary

Add two-factor (2FA) and multi-factor (MFA) authentication support. Enhance security with TOTP, e-mail verification, and hardware key support (SMS dropped as a factor — see epic note). Canonical ticket for the 2FA cluster (`TASK-2fa-mfa.md` folded in, `matrix-authentication-channels.md`). From `epic-two-factor-auth.md`.

## Scope

### TOTP (Time-based One-Time Password)

- Google Authenticator / Authy support
- QR code generation
- Backup codes

### SMS Verification

- SMS code delivery
- Phone number management
- Fallback mechanisms

### Email Verification

- Email code delivery
- Email verification flow
- Recovery options

### Hardware Key Support

- WebAuthn/FIDO2
- Security key registration
- Backup methods

## Linked Epics

- `epic-two-factor-auth.md`

## Acceptance Criteria

- [ ] TOTP support with QR code generation
- [ ] Backup codes system
- [ ] SMS verification with code delivery
- [ ] Email verification flow
- [ ] Hardware key (WebAuthn) support
- [ ] 2FA/MFA enrollment and management UI
- [ ] Fallback mechanisms for lost devices
- [ ] Unit tests for 2FA/MFA logic
- [ ] Integration tests for auth flow

## Notes

- Reference `epic-two-factor-auth.md` for full system design
- Channel provisioning + unlock semantics (verified ownership, ladder, cooling-off, messenger/e-mail/OIDC transports): `epic-auth-channel-provisioning.md` work items F1–F10
- Shared contracts (`FactorKind`/`FactorState`/`ChallengePurpose`, adapter capability flags): `matrix-authentication-channels.md`
- Consider recovery mechanisms for lost devices
- Balance security vs. user convenience
