<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Multi-factor authentication

Loop Lore 1.0.0 ships code-based MFA over email or messenger. A factor is an
operator/user-owned delivery destination; a challenge is a short-lived code
sent to that destination. TOTP and WebAuthn are not built in this release.

## Enroll a factor

`POST /api/v1/auth/factors` with a JSON body `{ "kind": "email" | "messenger-matrix" | "messenger-im", "target": "<destination>" }`.
The authenticated caller receives `{ "factorId": "..." }`; the factor stays
unverified until a challenge with purpose `enroll` succeeds. Enrollment is
rate-limited per user.

## Issue and verify a challenge

1. `POST /api/v1/auth/factors/challenge` with `{ factorId, channel: "email" | "messenger", destination, purpose }`. Valid purposes are `enroll`, `login`, `stepup`, `address-change` and `unlock`. Issue attempts are rate-limited per channel; the response never carries the code.
2. `POST /api/v1/auth/factors/verify` with `{ challengeId, code, purpose }`. The code is consumed once and must match the stored factor owner. A successful `enroll` challenge activates the factor; other successful purposes re-sign the session JWT with `amr: ["mfa-<kind>"]` and an updated `auth_time` (step-up).

Unknown, foreign and channel-mismatched factors share one 404 so the endpoint
does not disclose which factors exist. If no delivery bridge is configured,
challenge issuance fails closed rather than silently dropping the code.

## Operator configuration

`GET/PATCH /api/v1/admin/mfa/config` (requires `admin.system`) reads and sets
the email sender, per-channel rate-limit windows and messenger bot token. The
response reports `configured`/`tokenConfigured` booleans instead of echoing
secrets; an empty sender or non-positive window is rejected. SMTP transport
uses fail-closed TLS.

See [state and instances](./state-and-instances.md) for where MFA configuration
is persisted.

## Setting up delivery channels

Both channels sit behind the integrations master switch: set `[integrations]
enabled = true` and enable the channel's own section in `configs/config.example.toml`
(or the matching env vars in `configs/env.example.yaml`). With neither channel
configured there is no MFA bridge at all and challenge issuance fails closed
with 503 — the code is never silently dropped.

### Email (SMTP)

The email transport is the stdlib SMTP client; no mail library is needed.

```toml
[integrations]
enabled = true

[integrations.email]
enabled = true
smtpHost = "smtp.example.com"
smtpPort = 587          # 465 = implicit TLS; other ports use STARTTLS
smtpUser = "bot@example.com"
smtpPass = "..."        # secret; env: EMAIL_SMTP_PASS
```

The other env overrides are `EMAIL_SMTP_HOST`, `EMAIL_SMTP_PORT` and
`EMAIL_SMTP_USER`. Certificate verification stays on; the transport never
downgrades to cleartext. The sender address stamped on MFA mail and the
per-user resend window are `system_config` overrides, set through the admin API:

```bash
curl -X PATCH /api/v1/admin/mfa/config -H 'Content-Type: application/json' \
  -d '{"email":{"sender":"no-reply@example.com","windowMs":60000}}'
```

`GET /api/v1/admin/mfa/config` reports `email.configured` and the effective
`windowMs`; secrets are never echoed. Defaults are `no-reply@loop-lore.local`
and 60 000 ms (one code per user per minute).

### Telegram (messenger-im)

Enable the Bot API integration and supply a bot token:

```toml
[integrations.telegram]
enabled = true
botToken = "..."        # secret; env: TELEGRAM_ENABLED / TELEGRAM_BOT_TOKEN
```

The token used for MFA delivery is the admin override in `system_config`, read
fresh on every send:

```bash
curl -X PATCH /api/v1/admin/mfa/config -H 'Content-Type: application/json' \
  -d '{"messenger":{"botToken":"123456:ABC...","sender":"loop-lore-mfa-bot","windowMs":60000}}'
```

`GET` returns only `messenger.tokenConfigured`, the sender and the window — the
token is write-only. Rotating it with `PATCH` takes effect on the next send; no
restart or bridge rebuild is needed. The resolved token is bound by target
shape: a numeric chat id goes to Telegram, an email address to SMTP, and an
unowned target fails closed.

Factor kind `messenger-im` takes a numeric Telegram chat id (signed decimal,
at most 19 digits) as its target. A Matrix-style `@user:server` id is not a
Telegram target and is rejected at challenge issue.

### Matrix support — deferred, not supported

Matrix delivery does **not** ship in 1.0.0; treat it as deferred, not as a
configurable path. The config skeleton exists (`integrations.matrix.homeserver`,
`accessToken`, `appservice` and the `MATRIX_*` env vars) and `messenger-matrix`
is an accepted enrollment kind with an `@localpart:server` target grammar, but
no concrete Matrix adapter exists — `src/integrations/matrix/adapter.ts` is
still listed as planned in `docs/spec/federation-messenger-channels.md`. The
production MFA bridge (`createMfaBridge` in `src/routes/v1/base-surface.ts`)
registers only the email and Telegram adapters, so a Matrix-shaped factor has
no adapter that owns its target and challenge issuance fails closed. Do not
enroll `messenger-matrix` factors expecting delivery.

## Recovery

There are no backup or recovery codes, and TOTP/WebAuthn are not built in this
release (see the intro). Login stays password-based, so a user who loses a
delivery destination can still sign in and recover from an authenticated
session:

1. Enroll a replacement factor with `POST /api/v1/auth/factors` using
   `{ "kind": "email" | "messenger-im", "target": "..." }`.
2. Issue a challenge for it with purpose `enroll` and verify the code; this
   sets `verified_at` and activates the factor.
3. Re-run the step-up-gated action — verification re-signs the session JWT with
   `amr: ["mfa-<kind>"]` and a fresh `auth_time`.

A challenge is single-use, expires after 10 minutes, allows five code attempts
and is swept once its TTL elapses; resends are capped at one per user per
60-second window. The `unlock` and `address-change` purposes are reserved in the
challenge vocabulary but have no shipped self-service flow in 1.0.0 — do not
treat them as a recovery mechanism. There is no API to list or delete individual
factors: clearing a user's factors is a direct database operation on
`auth_factors` (and any pending `auth_challenges`), followed by re-enrollment as
above. `DELETE /api/v1/users/me` also removes factors, but deletes the account's
other data with them and is not a recovery step.
