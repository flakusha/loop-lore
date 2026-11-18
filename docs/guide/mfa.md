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
