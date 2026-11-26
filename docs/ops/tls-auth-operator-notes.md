<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

> Non-authoritative reference — verify against `src/` and the cited config keys.
> Precedence: `AGENTS.md > .plan/ > src/ > docs/spec`.

# TLS & Auth Operator Notes

Operator-facing notes for three behaviors that shipped in worktree-only TLS/auth
lanes and were deliberately left out of the startup documentation. This page
changes no runtime behavior; it records what operators must do when rolling
them out. Verify each behavior against the cited source before acting on it.

## 1. Integration token lifecycle (`llri_`)

Newly minted integration tokens are **always time-bounded**:

- No requested expiry → the token expires 24h after minting
  (`INTEGRATION_TOKEN_DEFAULT_TTL_MS`,
  `src/middleware/auth/integration-token.ts:39-44`).
- A requested expiry is clamped into the range up to 7d from minting
  (`INTEGRATION_TOKEN_MAX_TTL_MS`, same source). An unparseable request is
  rejected at the admin route's trust boundary.
- The raw bearer value is returned exactly once by the mint response; only its
  hash is stored (`src/routes/admin/integration-tokens.ts`).

**Action required for pre-policy tokens.** Verification now fails closed when a
token row has a NULL, unparseable, or past `expires_at`
(`src/middleware/auth/integration-token.ts:116-123`). A minted row always carries
an expiry, so a NULL stamp marks an old, "eternal" credential: it is **rejected**,
not treated as never-expiring. No migration rewrote existing rows. Operators
MUST revoke and re-issue any such token through the admin route — revoke with
`DELETE <api-prefix>/admin/integration-tokens/:id`, then mint a replacement with
`POST <api-prefix>/admin/integration-tokens` (optionally supplying `expiresAt`).
The list endpoint (`GET <api-prefix>/admin/integration-tokens`) never returns
secret material. Route definitions: `src/routes/admin/integration-tokens.ts`.

## 2. Generated TLS private key permissions

When the app auto-generates a self-signed certificate, the freshly written
private key is restricted to owner-only access immediately after a successful
generation (`restrictGeneratedKeyMode()`,
`packages/core/src/config/cert.ts:41-55,116-118`):

- **POSIX:** `chmod 0600` is enforced; a failure is fatal (fail closed).
- **Windows:** `chmod` only toggles the read-only bit, so a failure is logged as
  a warning and startup continues — best-effort, not a hard guarantee.

The reuse fast path — when both key and cert already exist — returns before this
step, so **pre-existing key modes are never changed**, and the public
certificate's mode is untouched. Operators should still audit the mode of any
key provisioned before this behavior shipped.

## 3. JWT issuer opt-in (`AUTH_JWT_ISSUER`)

The issuer claim is opt-in via the `AUTH_JWT_ISSUER` environment variable, which
is read at call time (`configuredIssuer()`, `src/auth/jwt.ts:140-143`). It is not
an entry in the config schema by design.

- **Unset or empty (legacy mode):** newly signed tokens carry no `iss`, and
  verification places no issuer requirement on incoming tokens. Tokens issued
  before this behavior keep working; no compatibility window is needed
  (`src/auth/jwt.ts:153-160,249-254`).
- **Set to a value:** newly signed tokens are bound to that issuer, and
  verification rejects any token whose `iss` is missing or different with
  `Invalid issuer` (`src/auth/jwt.ts:249-254`).

Setting the variable is an **explicit opt-in that invalidates pre-issuer tokens**.
Roll it out at a token cutover, accepting that existing sessions stop verifying
at that point (they would otherwise expire at their existing `exp`).
