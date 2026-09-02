<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Authentication Channel Provisioning — Messenger / E-mail / Federated Login & Unlock

**Status:** 📝 Planned (this bundle)
**Priority:** High (security-critical provisioning)
**Effort:** High
**Type:** Feature Epic
**Tags:** auth, 2fa, mfa, login, unlock, step-up, matrix, email, messenger, federation, device-trust

## Summary

Guarantee that an **authorized user can always log in, re-authenticate (step-up), and unlock their account through a properly provisioned second-factor channel** — TOTP, WebAuthn, e-mail OTP, messenger OTP/approval (Matrix and its bridges, IM adapters), federated identity assertions — while ensuring **no channel can grant access before its ownership is verified**, and no channel loss can lock a legitimate user out or let an attacker recover an account.

`epic-two-factor-auth.md` covers the *factor mechanisms* (TOTP/SMS/WebAuthn/backup). This epic covers the *delivery, binding, provisioning, and unlock semantics* around those factors: who may use which channel, how a channel becomes trusted, what happens on change/loss/attack, and how federated systems participate — the gap between "2FA exists" and "login/unlock is correctly provisioned to the authorized user".

## Current State (reviewed 2026-09-02)

- **No 2FA implementation exists.** No `totp`/`second_factor`/`auth_factor` symbols in `src/`; `src/auth/` is `jwt.ts` only. `UserStatus` is `active|disabled|deactivated` — no lockout/unlock states.
- **Auth core is real and recent:** JWT bearer/cookie validation in `src/middleware/auth/token.ts` (+ `authenticate.ts`, `solo-user.ts`); user-status gate in `resolveUserIdFromRequest` (`c9ca8edd`); `sessions` table indexed (`023_date_field_indexes`); `src/routes/auth/` + `actor-auth.ts` shipped.
- **Recorded deferral being re-opened by this bundle:** "MFA (TOTP) deferred to P6+ (2026-08-05, local-only auth)" — `open-deferred.md` #7, `priority-p0-p2.md` P2-E. Planning resumes here; *implementation* priority is a human re-triage decision (see Backlog rows).
- **Messenger / e-mail transports are planned, unbuilt:** `epic-integrations-core.md` (ProtocolAdapter/MessageBridge/EncryptionProvider — the shared abstraction), `epic-matrix-integration.md` (incl. Discord/Slack/IRC bridges via appservices), `epic-im-integrations.md`, `epic-xmpp-integration.md`, `epic-irc-integration.md`, `epic-feishu-lark-integration.md`, `epic-email-integration.md` (nodemailer/imapflow/PGP). No `src/integrations/` on disk.
- **Federation today is content-only** (character federation; see `BUG-character-federation-lacks-owner-consent-or-nsfw-gate.md`) — there is **no human-identity federation/SSO** anywhere in plan or code.
- **Notifications are in-app only** (`src/notifications/service`) — no outbound channel that could deliver a code today.
- **Duplicate tickets:** `TASK-2fa-mfa.md` ⊂ `TASK-two-factor-multi-factor-auth.md` (both generated from the epic; reconciled below).

## Design Invariants

1. **Verified-ownership-only.** A factor may authenticate, approve, or unlock **only** after an ownership challenge completed *on that channel itself* (code echoed back through the web UI, or inbound reply for bot-routed channels). Unverified bindings have zero auth power — enforced by factor `state` enum (`unverified|active|revoked`), checked at every verification call.
2. **Strict factor management.** Add/remove/modify of any factor requires: valid session **+** an already-active second factor (step-up). Changing a channel address (e-mail, Matrix MXID, bot handle) immediately invalidates the old binding for recovery use and requires re-challenge.
3. **Anti-takeover cooling-off.** A newly verified channel cannot be used for **recovery/unlock** for a configurable delay (default 24 h); every factor change emits notifications to all *other* active channels + audit log. An attacker who steals the password cannot instantly mint a usable recovery path.
4. **Deterministic unlock ladder.** Rungs, strongest-first: device-trust token → WebAuthn → TOTP → messenger OTP/approval → e-mail OTP → backup code → admin-assisted recovery. A weaker rung never bypasses an available stronger rung when policy demands it; each rung is single-purpose, single-use, rate-limited, bound to `(user, factor, purpose)`.
5. **Transport, not authority.** Messenger channels deliver and confirm factors; they do not become identity authorities by themselves — with the sole exception of *explicitly configured* federated IdP trust (invariant 6). OTP delivery goes through the `ProtocolAdapter`/`EmailAdapter` interfaces (integrations-core), never per-channel ad-hoc clients.
6. **Federated assertions need explicit binding.** OIDC/Matrix-SSO login maps to a local user only through a verified `identity` binding table; no auto-provisioning; revocation at the IdP must not silently widen access (bindings are admin/step-up managed, and assertion-based login is just another factor rung, revocable locally).
7. **No dead ends, no silent downgrades.** Channel outage (adapter unhealthy per integrations-core health) transparently falls to the next ladder rung — never a hard lockout for the legitimate user, never a policy bypass for an attacker (configurable minimum-factor-count is still enforced).
8. **Secret hygiene.** Challenge nonces and factor secrets hashed/encrypted at rest (`src/crypto/` envelope); codes never logged; failed-attempt telemetry structured-logged for admin visibility.

## Scope

### A. Factor & challenge data layer

- Migration: `auth_factors` (user, kind, state, label, encrypted secret/config, verified_at, last_used), `auth_challenges` (user, factor, purpose `login|stepup|enroll|address-change|unlock`, nonce hash, expires, attempts, consumed), `auth_devices` (device-trust tokens, bound to factor strength + expiry), `factor_audit` (append-only lifecycle events).
- `FactorKind` enum vocabulary incl. `messenger-matrix`, `messenger-im`, `email`, `federated-oidc` (full cross-epic vocabulary in `matrix-authentication-channels.md`).
- Service layer `src/auth/factors/` (factory + Result types per repo patterns); Kysely-only, no DB-module leakage into services.

### B. Enrollment & ownership verification

- TOTP: QR + manual secret, verify-by-code enrollment; backup codes (single-use, hashed).
- WebAuthn/FIDO2: registration + assertion ceremony (platform authenticators included).
- E-mail OTP: send challenge via `EmailAdapter` (depends on email-integration SMTP slice), verify echo-back; e-mail-address change requires fresh challenge on the **new** address (invariant 2).
- Messenger OTP/approval: Matrix DM (and bridged Discord/Slack/IRC), IM adapters — deliver code, or number-matching approval push ("approve login 42?" reply). Verification requires the user to echo the challenge **from the bound address/handle** — inbound route parses it (bot channels) or user retypes it (no-inbound channels).
- Last-factor-standing guard: when enforcement is on, operations that would leave a user with zero usable factors are blocked with guidance (add before remove).

### C. Login integration

- Password (or passkey-only where enrolled) → factor prompt → session token carries `amr` (authentication methods used) + `auth_time`; step-up compares session freshness against policy.
- Admin enforcement matrix: per-instance ("require 2FA for all"), per-role (admin/gm minimum count), per-sensitive-route (factor management, admin config, key export).

### D. Unlock / step-up semantics

- Step-up triggers: factor management, admin endpoints, recovery flows, configurable TTL for privileged ops (re-auth after N minutes of inactivity on sensitive surfaces).
- Failed-factor backoff: per-(user, factor) throttling with escalating cooldown — locks the *factor attempt path*, not the victim's account; global account lockout only via admin `UserStatus` transition.
- Admin lock/unlock: lock = `disabled` + kill sessions + audit; unlock requires admin **and** notifies the user through their verified channels; self-service unlock ladder runs for suspended-but-not-disabled states (challenge-gated re-activation) — see ladder invariant 4.
- Device trust: "remember this device" mints `auth_devices` token bound to UA + factor rung used; token exempts OTP steps for TTL but never exempts step-up on factor-management routes.

### E. Provisioning guarantees for the authorized user

- Change notifications to all active channels; cooling-off on recovery use of new channels (invariant 3).
- Admin factor inventory UI: who has what, verified when, last used, per-instance enforcement status; import-time defaults for fresh installs (solo-user mode exempt path documented).
- Rate limiting + circuit breaker per (user, factor, purpose) wired to existing rate-limit middleware; abuse lockout is observable, appealable (backup codes / admin).
- Recovery wizard (lost device / lost messenger): strongest-available-rung escalation ladder with audit trail; backup codes are the last self-service rung.
- Erasure cascade: account delete/deactivate revokes all factors, challenges, devices (soft-delete exclusion invariant matching repo patterns).

### F. Federated / external identity

- OIDC relying-party login (optional, admin-configured provider): assertion → verified binding → treated as `federated-oidc` factor rung. Not an IdP-for-others (non-goal).
- Matrix SSO / dehydrated-device login: evaluated as *messenger factor transport* first (user keeps local account, Matrix DM is the channel); full Matrix-identity login behind config flag with binding table (invariant 6).
- ActivityPub / character federation: explicitly **not** human auth (servers, not people) — documented in non-goals; cross-ref the federation consent bug for the content side.

### G. UI / docs / tests

- htmx factor-management page (setup, verify, revoke, device list, activity), login factor prompt partial, recovery wizard partial, admin enforcement panel.
- `docs/spec/2fa.md` rewrite to match TypeBox reality (`src/validation/`), not Zod.
- Unit: factor lifecycle state machine, ladder order, cooling-off, TTL/single-use/rate-limit enforcement; integration: login with each rung; e2e: enroll→verify→logout→login→unlock flow per channel kind with mocked adapters.

## Work Items

- [ ] F1 — Schema + `auth_factors`/`auth_challenges`/`auth_devices`/`factor_audit` + service core (`src/auth/factors/`) → `.plan/tickets/auth-factors-schema-and-service-core-f1.md`
- [ ] F2 — TOTP + backup codes + WebAuthn (factor mechanics, shared with `epic-two-factor-auth`) → `.plan/tickets/totp-backup-codes-and-webauthn-mechanics.md`
- [ ] F3 — Step-up middleware (`auth_time`/`amr` in JWT, route policies) + login factor prompt → `.plan/tickets/f2-step-up-middleware-login-factor-prompt.md`
- [ ] F4 — Unlock ladder + failed-factor backoff + admin lock/unlock + device trust → `.plan/tickets/f4-unlock-ladder-backoff-device-trust.md`
- [ ] F5 — E-mail OTP (blocked by email-integration SMTP slice — interface stub via EmailAdapter meanwhile) → `.plan/tickets/f5-e-mail-otp-factor-delivery.md`
- [ ] F6 — Messenger OTP/approval via ProtocolAdapter (Matrix first; inbound verification route; health-aware fallback) → `.plan/tickets/f6-messenger-otp-and-login-approval.md`
- [ ] F7 — Provisioning guarantees hardening (cooling-off, change notifications, inventory UI, erasure cascade, rate limits) → `.plan/tickets/f7-factor-provisioning-guarantees-hardening.md`
- [ ] F8 — OIDC RP login + binding table (optional feature flag) → `.plan/tickets/f8-oidc-rp-login-with-identity-bindings.md`
- [ ] F9 — Factor-management / recovery UI (htmx) + admin enforcement config → `.plan/tickets/f9-factor-management-and-recovery-ui.md`
- [ ] F10 — Tests: unit + integration + e2e (mocked adapters) + `docs/spec/2fa.md` → `.plan/tickets/f10-auth-factors-tests-and-2fa-spec-rewrite.md`

## Non-Goals

- Acting as an identity **provider** for other applications (RP-only).
- SMS as a factor (SIM-swap risk, provider cost — e-mail + messenger fill the role; revisit only with carrier-vetted infra).
- Passwordless-only enforcement (passkey-primary stays opt-in per user).
- Per-chat/per-world auth factors (auth is per-user; chat access is a separate layer — `checkChatAccess`).
- ActivityPub human identity federation in v1.

## Acceptance Criteria

- [ ] No factor with `state != active` can ever satisfy a login/step-up/unlock check (property test over state machine).
- [ ] E-mail/messenger address change immediately de-authorizes the old address for recovery use (test).
- [ ] New channel within cooling-off cannot unlock a locked/recovered account; older channels can (test).
- [ ] Ladder order + minimum-factor-count policy enforced server-side, per-route configurable (test).
- [ ] Every challenge: single-use, TTL'd, bound to `(user, factor, purpose)`, attempts rate-limited (tests).
- [ ] Adapter unhealthy → fallback rung used, event audited, no hard lockout (integration test with fake adapter).
- [ ] Factor lifecycle fully audited without secret material in logs (log-redaction test).
- [ ] e2e: enroll → logout → login with messenger OTP → step-up on factor page → revoke → recovery via backup code → admin lock → admin unlock notifies user (mocked transports).
- [ ] `bun run check` green; no migration drift (schema regeneration per AGENTS.md).

## Files

- `src/db/migrations/` — F1 tables (+ `db:sync-types`/`db:sync-manifest` regeneration)
- `src/auth/factors/` — factor service core; `src/auth/channels/` — delivery adapters bridge (ProtocolAdapter/EmailAdapter consumers); `src/auth/devices.ts`
- `src/middleware/auth/stepup.ts` — rung policy enforcement (alongside existing `token.ts`/`authenticate.ts`)
- `src/routes/auth/` — factor CRUD, challenge verify, recovery, admin inventory
- `src/validation/schemas.ts` (+ `src/validation/`) — TypeBox request/response schemas
- `src/views/` + `src/frontend/alpine/` — factor management + login prompt partials
- `docs/spec/2fa.md` — specification (updated to real stack)

## Related Epics

- `epic-two-factor-auth.md` — factor mechanisms (TOTP/WebAuthn/backup/recovery); this epic wraps them in provisioning + channel semantics. **Supersedes its SMS item with messenger/e-mail OTP.**
- `epic-auth-access.md` — registration/login routes, MFA phase 2, access control (P2-E parent).
- `epic-integrations-core.md` — `ProtocolAdapter`/`MessageBridge` interfaces this epic consumes for all channel delivery.
- `epic-matrix-integration.md` — Matrix DM OTP/approval + bridged Discord/Slack/IRC reach; Matrix SSO option.
- `epic-im-integrations.md`, `epic-xmpp-integration.md`, `epic-irc-integration.md`, `epic-feishu-lark-integration.md` — additional messenger rungs once adapters land.
- `epic-email-integration.md` — SMTP send path (`EmailAdapter`) required by F5.
- `epic-federation-swarm-sync.md`, `epic-anonymity-decentralization.md` — federation context; human-identity federation gap this epic fills (OIDC/Matrix SSO).
- `epic-communications-integrations.md` — parent framing for transports.
- Cross-epic integration surface + shared vocabulary: **`matrix-authentication-channels.md`**.

## Tickets

- `TASK-two-factor-multi-factor-auth.md` — canonical factor ticket (extended with channel-provisioning work items F1–F10 pointers)
- `TASK-2fa-mfa.md` — duplicate of the above (epic-generated); reconciled as folded
