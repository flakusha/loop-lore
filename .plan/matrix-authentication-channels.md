<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Matrix: Authentication Channels (2FA provisioning × transports × federation)

**Scope:** cross-epic integration surface for verified-factor login/unlock provisioning —
`epic-auth-channel-provisioning.md` against the 2FA core, transport, federation, and
auth-infrastructure epics.
**Status:** Proposed (design-stage; all rows are doc-resolved pending implementation)
**Tags:** auth, 2fa, security, integrations

**Epics:** `epic-auth-channel-provisioning.md`, `epic-two-factor-auth.md`,
`epic-auth-access.md`, `epic-integrations-core.md`, `epic-matrix-integration.md`,
`epic-email-integration.md`, `epic-im-integrations.md`, `epic-federation-swarm-sync.md`,
`epic-anonymity-decentralization.md`, `epic-frontend-notifications.md`

## Pairwise Integration Gaps (AC1–AC12)

`[WASN]` = open decision to resolve before implementation; resolved rows cite the doc that answers them.

| # | Pair | Surface / gap | Resolution (doc-resolved) | Status |
|---|------|---------------|---------------------------|--------|
| AC1 | provisioning × two-factor-auth | Factor **mechanics** (TOTP algo, WebAuthn ceremony, backup-code format) vs **binding/lifecycle** (states, challenges, ladder) split across two epics | Mechanics live in `src/auth/factors/mechanisms/` owned by 2FA epic; state machine + challenge tables owned by provisioning epic; single `FactorKind` enum shared | ✅ doc-resolved |
| AC2 | provisioning × auth-access | Login route integration: `src/routes/auth/` + `token.ts` must carry `amr`/`auth_time` claims; step-up middleware ordering vs `requireUserId`/status gate (`c9ca8edd`) | `stepup.ts` runs **after** `authenticate` (identity) and **before** route handler (assurance); claims added to token mint path only | ✅ doc-resolved |
| AC3 | provisioning × integrations-core | OTP/approval delivery must go through `ProtocolAdapter` capability flags, not raw clients | Adapters expose `sendAuthChallenge(challenge, target): Result` capability (`auth-challenge` in adapter capability registry); text is never sent to a channel lacking the flag | `[WAC1]` open — capability enum naming must match core epic's registry shape when it lands |
| AC4 | provisioning × matrix-integration | Matrix DM as OTP channel + number-matching approval; inbound verification (user replies code to bot) needs the matrix event-receive path | MXID bound as address; reply parsing reuses message-bridge inbound route with a dedicated `auth_challenge` command namespace; E2EE rooms: DM only, verified session required for approval semantics | `[WAC2]` open — whether approval requires Megolm-verified session (stronger) or accepts unverified (availability) |
| AC5 | matrix bridges × factor kinds | Users reachable on Discord/Slack/IRC **through** Matrix appservices | One factor kind `messenger-matrix`; bridge reach is transport detail invisible to auth layer; abuse limits (rate) are per-factor, not per-bridge | ✅ doc-resolved |
| AC6 | provisioning × email-integration | F5 e-mail OTP blocked until SMTP slice (`nodemailer` in EmailAdapter) exists | Provisioning ships stub `EmailSender` interface; email epic fills impl; login falls through rung when absent (invariant 7) | ✅ doc-resolved |
| AC7 | provisioning × im-integrations (xmpp/irc/feishu/telegram) | Additional rungs need per-adapter `auth-challenge` capability + inbound command parsing parity | Adapters that lack inbound routes deliver OTP only (retype into web UI); approval-push requires inbound → capability `auth-approval` separate flag | `[WAC3]` open — feishu/xmpp inbound scope decided per adapter epic |
| AC8 | provisioning × federation-swarm-sync / anonymity-decentralization | Human-identity federation absent everywhere; swarm/mesh nodes must not become auth authorities | Auth decisions **local-server only**; mesh transports may carry the OTP payload but factor verification re-checks locally; OIDC RP is the single external-assertion path | ✅ doc-resolved |
| AC9 | provisioning × notifications (in-app) | Factor-change alerts currently have no outbound channel pre-F5/F6 | In-app notification always written; channel fan-out activates as adapters land; last-standing rule (never notify only the changed channel) | ✅ doc-resolved |
| AC10 | provisioning × nsfw/age-gate | No coupling intended — auth rung strength must not reveal age-gate state | Challenge/unlock error messages identical across states (enumeration-safe); admin lock is separate from `UserStatus` semantics already defined | ✅ doc-resolved |
| AC11 | provisioning × e2e-crypto (per-chat keys) | Device-trust tokens vs chat E2EE device keys are different objects; UI must not conflate | `auth_devices` (server-verified) vs Olm/megolm devices (client-verified) naming + section split in factor UI | ✅ doc-resolved |
| AC12 | provisioning × admin/config | Enforcement policy storage: `config.toml` `[auth]` section vs per-user overrides | Instance defaults in config (TypeBox schema + `schemas/loop-lore-config.schema.json` regeneration), per-user state only in `auth_factors`; admin panel edits via existing admin-gate routes | `[WAC4]` open — per-role minimum count policy shape (static config vs DB policy table) |

## Shared Data Contracts

- **`FactorKind`**: `totp | webauthn | email | messenger-matrix | messenger-im | backup | federated-oidc` — single enum in `src/db/enums-core/` (migration-generated), consumed by provisioning, UI, admin inventory.
- **`FactorState`**: `unverified | active | revoked` — the invariant-1 gate; no other states (lockout is per-challenge throttling, not factor state).
- **`ChallengePurpose`**: `login | stepup | enroll | address-change | unlock | recovery` — challenge binds `(user, factor, purpose)`; purposes are not interchangeable.
- **Adapter capability flags** (integrations-core registry): `auth-challenge` (outbound OTP), `auth-approval` (inbound command reply). Absent = rung skipped by ladder, never faked.
- **JWT claims**: `amr: FactorKind[]`, `auth_time: epoch` — additive to existing token shape (`src/auth/jwt.ts`), old tokens verify with empty `amr` ⇒ treated as password-level.
- **Audit event kinds**: `factor.enroll|verify|revoke|address-change | challenge.issue|consume|expire | unlock.ladder-step | admin.lock|unlock | device.trust-grant|revoke` — structured logger, secret-free.

## Ticket Reconciliation (2FA cluster)

| Ticket | Status | Disposition |
|--------|--------|-------------|
| `TASK-2fa-mfa.md` | epic-generated duplicate | **folded** (executed) into `TASK-two-factor-multi-factor-auth.md` (kept as alias stub; sync pass may delete) |
| `TASK-two-factor-multi-factor-auth.md` | canonical | extended with F1–F10 pointers to this bundle |

## Post-land Bookkeeping Checklist (for whoever implements / maintains `.plan/`)

- [x] After finalize: execution tickets F1–F10 created with git issues + linked from epic work items (2026-09-02, `plan-bookkeeping-2fa-emotion`).
- [ ] Reconcile `open-deferred.md` #7 row (MFA deferral) once implementation is scheduled — decision is human re-triage; planning bundle only records the reopen.
- [ ] Resolve `[WAC1..4]` open decisions as their counterpart epics (integrations-core capability registry, matrix inbound) land; update rows in place.
- [ ] When first messenger factor ships, add an e2e flows spec (`tests/e2e/flows/auth-factors.test.ts`) and update this matrix AC4/AC7 rows with real adapter names.
- [x] `plan:sync:fix` + `plan:docs` regeneration — executed in the 2026-09-02 bookkeeping pass (8 advisory orphan git issues remain from a concurrent wardrobe batch — owner session should reconcile or `plan:sync:fix`).
