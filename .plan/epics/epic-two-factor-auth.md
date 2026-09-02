<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Two-Factor / Multi-Factor Authentication

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Issue:** `280c355`
**Type:** Feature Epic

## Summary

Add two-factor (MFA-capable) authentication support: factor **mechanisms** — TOTP, e-mail verification codes, backup codes, hardware keys (WebAuthn/FIDO2) — and their enrollment/verification flows.

The surrounding **provisioning semantics** (which channel may grant login/unlock, ownership verification, unlock ladder, anti-takeover cooling-off, messenger/federated transports) live in **`epic-auth-channel-provisioning.md`** — the two epics share the `FactorKind`/`FactorState`/`ChallengePurpose` vocabulary defined there and in `matrix-authentication-channels.md`.

## Current State (reviewed 2026-09-02)

- No implementation: no TOTP/WebAuthn/backup-code symbols in `src/`; `src/auth/` holds `jwt.ts` only; no factor/challenge tables in migrations; `UserStatus` has no lockout state.
- Recorded deferral: "MFA (TOTP) deferred to P6+ (2026-08-05, local-only auth)" (`open-deferred.md` #7). This planning bundle reopens design; scheduling remains a human re-triage decision.
- Duplicate tickets `TASK-2fa-mfa.md` / `TASK-two-factor-multi-factor-auth.md` reconciled in `matrix-authentication-channels.md` (fold the former into the latter).

## Scope (factor mechanisms)

### TOTP (Time-based One-Time Password)

- Google Authenticator / Authy / 1Password support
- QR code + manual secret enrollment, verify-by-code activation
- Backup codes: generation, hashed storage, single-use consumption
- TOTP verification flow behind the shared challenge service

### E-mail Verification

- OTP delivery via `EmailAdapter` (SMTP slice of `epic-email-integration.md`; stubbed interface until then)
- Code verification + e-mail change re-verification (address change never trusts the old address)

### Hardware Keys (WebAuthn/FIDO2)

- Security keys (YubiKey) + platform authenticators (Touch ID, Windows Hello)
- Registration and assertion ceremonies; discoverable-credential option for passkey-primary login (opt-in per user)

### Recovery

- Backup codes as last self-service rung (ladder order owned by the provisioning epic)
- Admin-assisted recovery flow with audit + user notification on all active channels

### SMS

- **Dropped as a planned factor** (SIM-swap risk, provider cost): messenger OTP (`messenger-matrix`/`messenger-im`) and e-mail OTP replace the role. Revisit only with carrier-vetted infrastructure.

## Tasks

- [ ] Design factor mechanics on the shared state machine (`epic-auth-channel-provisioning.md` F1 tables)
- [ ] TOTP: generation, verification, enrollment QR
- [ ] Backup codes system
- [ ] E-mail OTP delivery + verification (interface-stub until email SMTP slice)
- [ ] WebAuthn/FIDO2 registration + assertion
- [ ] 2FA setup UI (factor pages, per `src/views/` + htmx patterns)
- [ ] Recovery flow UI (wizard driven by the provisioning ladder)
- [ ] Enforcement options surface for admins (policy shape in provisioning epic AC12)
- [ ] Tests for all mechanisms (unit + integration; e2e owned by provisioning F10)

## Files

- `src/auth/factors/mechanisms/` — totp.ts, webauthn.ts, backup.ts (mechanism implementations)
- `src/auth/factors/` — shared service core (owned by `epic-auth-channel-provisioning.md`)
- `src/routes/auth/` — factor enrollment/verification endpoints (expand existing)
- `src/views/`, `src/frontend/` — 2FA setup + recovery UI
- `docs/spec/2fa.md` — specification (**rewrite to the real stack**: Elysia TypeBox in `src/validation/`, not Zod)

## Related Epics

- **`epic-auth-channel-provisioning.md`** — binding lifecycle, ownership verification, messenger/federated channels, unlock & step-up semantics (parent of this bundle's design invariants)
- `epic-auth-access.md` — registration/login routes (P2-E parent epic)
- `epic-email-integration.md` — SMTP transport for e-mail OTP
- `epic-integrations-core.md` / `epic-matrix-integration.md` / `epic-im-integrations.md` — messenger transports
- `matrix-authentication-channels.md` — pairwise gaps AC1–AC12 + shared contracts

## Linked Tasks

- TASK-two-factor-multi-factor-auth.md (canonical)
- TASK-2fa-mfa.md (duplicate — folded)
