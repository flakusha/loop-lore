<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

> Non-authoritative reference — verify against `src/` and the cited config keys.
> Precedence: `AGENTS.md > .plan/ > src/ > docs/spec`.

# Secure Startup Operator Checklist

Use this as a pre-flight pass before exposing a `loop-lore` instance. The shipped
defaults favor zero-config solo use (`auth.required=false`,
`registrationOpen=true`, `demoAutoSetup=true` —
`packages/core/src/config/sections/auth.ts:6-22`), so a network-facing instance
needs explicit hardening. Every item below names the config key or source doc
that governs it. This page changes no runtime behavior.

## Listener reality — read this first

The app still binds **plaintext HTTP on `PORT`** (default `3000`,
`src/server/start.ts:289-297`) **and HTTPS on `PORT+443`** (default `3443`, only
when TLS files exist, `src/server/start.ts:299-312`). The listeners have **not**
been consolidated. When TLS is configured, certificates are provisioned before
any listener binds and boot **fails closed** — a provisioning failure throws
instead of silently downgrading to plaintext (`src/server/start.ts:248-279`).
There is no application-level HTTP→HTTPS redirect; the HTTP→HTTPS 301 and HSTS
remain the **edge proxy's job** (`deploy/Caddyfile:28-43`,
`docs/ops/bare-metal/network.md:115`) unless app HSTS is explicitly enabled (see
item 6). Do not treat this page as a claim that the plaintext listener was
removed.

## Pre-flight checklist

- [ ] **1. Pick the TLS topology — proxy termination (canonical) vs direct TLS.**
      Proxy: set `DOMAIN`, `ACME_EMAIL`, `POSTGRES_PASSWORD`, then
      `docker compose -f deploy/docker-compose.yml up -d`
      (`deploy/docker-compose.yml:7-11,20-21,64-70`); Caddy publishes only
      80/443 (`:16-18`) and the app publishes no ports (`:32-34`), terminating
      TLS at `deploy/Caddyfile:18-43`. Direct TLS (no proxy): set `TLS_KEY` /
      `TLS_CERT` to CA-issued PEM (`env-map.ts:129-130`; paths re-anchored per
      `instance-path.ts:44-51`); HTTPS listens on `PORT+443`
      (`src/server/start.ts:301-309`) — firewall it and decide explicitly
      whether plaintext on `PORT` stays reachable (`src/server/start.ts:289-297`);
      a provisioning failure aborts boot rather than serving plaintext
      (`src/server/start.ts:248-279`).

- [ ] **2. JWT secret length and issuer.** Set `AUTH_JWT_SECRET` to at least 32 random
      characters (e.g. `openssl rand -base64 48`); boot throws below that
      minimum when `auth.required=true`
      (`packages/core/src/config/load/safety.ts:201-221`; env key
      `packages/core/src/config/schema-class/env-map.ts:152`). Also set
      `AUTH_CSRF_SECRET` (`env-map.ts:153`). Never ship a placeholder.
      `AUTH_JWT_ISSUER` is an optional env-only switch (read at call time, not in
      the config schema): unset/empty keeps legacy tokens with no `iss` valid;
      setting it binds `iss` on newly signed tokens and rejects every token
      without a matching issuer — invalidating all pre-issuer tokens
      (`src/auth/jwt.ts:134-160,249-253`). Set it before issuing tokens you
      intend to keep.

- [ ] **3. Close registration / demo defaults.** Dev defaults are
      `registrationOpen=true`, `demoAutoSetup=true`, `required=false`
      (`packages/core/src/config/sections/auth.ts:6-22`). Set
      `AUTH_REQUIRED=true`, `AUTH_REGISTRATION_OPEN=false`,
      `DEMO_AUTO_SETUP=false` (`env-map.ts:134,138,142`). The compose stack sets
      `AUTH_REQUIRED=true` (`deploy/docker-compose.yml:38`) but does not turn
      off registration or demo setup — add those explicitly.

- [ ] **4. Cookie `Secure` override and derived default.** For both `ll_token`
      and `csrf_token`, first match wins: explicit `LL_COOKIE_SECURE`
      (`true`/`false`) > effective server TLS (`config.server.tls`, wired at
      boot) > `NODE_ENV=production`
      (`src/middleware/csrf.ts:72-99`, `src/elysia-app.ts:199-217`,
      `src/routes/auth/shared.ts:105-123`). With no override and no TLS,
      `Secure` is emitted only for `NODE_ENV=production`; configuring TLS makes
      it the default even outside production. Compose sets it explicitly
      (`deploy/docker-compose.yml:42-46`); do not rely on `NODE_ENV` alone.

- [ ] **5. `trustProxy` and `publicOrigin`.** Set `SERVER_TRUST_PROXY=1` so
      `X-Forwarded-*` is honored, and
      `SERVER_PUBLIC_ORIGIN=https://<domain>` for nodeinfo/self-referential
      URLs and the MCP Origin/Host allowlist (`env-map.ts:131-132`,
      `docs/ops/bare-metal/network.md:120-127`, `deploy/Caddyfile:41-42`,
      `deploy/docker-compose.yml:40-41`). Defaults are `trustProxy=false`
      and empty `publicOrigin` (`packages/core/src/config/sections/server.ts:15`,
      `env-map.ts:131-132`); wildcard binds or MCP answer 503 without an
      origin (audit §1e). Forward `X-Forwarded-Proto`/`X-Forwarded-Host` at the
      edge.

- [ ] **6. HSTS — decide edge vs app.** HSTS is **off by default**
      (`packages/core/src/config/sections/headers.ts:49-51`), and the app emits
      it only when enabled and the request is seen as HTTPS **or** carries a
      trusted `X-Forwarded-Proto: https` (honored only with
      `SERVER_TRUST_PROXY=1`)
      (`src/middleware/response-headers.ts:219-230`, handler wiring at
      `src/server/handler.ts:45-47`). Canonical edge supplies it
      at `deploy/Caddyfile:31` and `docs/ops/bare-metal/network.md:72-78` (nginx
      at `:99`) — this is the reliable tier behind a TLS terminator. To enable
      it in the app, set `headers.hsts.enabled: true` in a config file, or use
      the generated env keys `HEADERS_HSTS_ENABLED`, `HEADERS_HSTS_MAXAGE`,
      `HEADERS_HSTS_INCLUDESUBDOMAINS`, `HEADERS_HSTS_PRELOAD`
      (`env-map.ts:69-79,99` recursively maps `HEADERS_DEFAULTS`; exact names in
      `schemas/env-map.snapshot.json:125-128`). Names are camelCase-flattened —
      `MAXAGE` / `INCLUDESUBDOMAINS`, not `MAX_AGE` / `INCLUDE_SUBDOMAINS`.

- [ ] **7. Generated key permissions.** Freshly generated self-signed keys are
      tightened to `0600` on POSIX (`chmodSync`); on Windows this is best-effort
      (a failure logs a warning). The reuse path never changes permissions on
      pre-existing key/cert files
      (`packages/core/src/config/cert.ts:41-55,74-76,117`). The SAN covers only
      `localhost` (`cert.ts:112-113`) — expect browser warnings on real domains.
      For real domains supply CA-issued PEM via `TLS_KEY`/`TLS_CERT` (item 1).

- [ ] **8. Setup-state TLS check caveat.** Resolved. The setup `tls` check now
      re-anchors relative / frozen-`DATA_DIR` cert paths onto the runtime
      instance dir via `resolveInstanceDir`/`resolveInstancePath`, matching boot
      provisioning (`src/routes/setup/checks.ts:119-135`; boot path at
      `packages/core/src/config/cert.ts:57-72`). A `tls off` result now uses the
      same paths as the HTTPS listener; confirm an unexpected result with the
      verification commands below before treating TLS as down.

- [ ] **9. Integration token expiry.** All minted `llri_` integration tokens
      carry a stamped UTC expiry: absent `expiresAt` defaults to 24h, requested
      instants are clamped to at most 7d
      (`src/middleware/auth/integration-token.ts:39-44,69-90`). Verification
      fails closed on NULL/missing, unparseable or past-due `expires_at` — no
      non-expiring credential survives (`integration-token.ts:116-123`). Issue
      with an explicit expiry; never expect a NULL expiry to be accepted.

- [ ] **10. Plaintext listener exposure.** The HTTP listener runs on `PORT`
      unconditionally (`src/server/start.ts:289-297`), including when TLS is
      provisioned, and there is no app-level redirect. TLS provisioning itself
      fails closed rather than falling back to plaintext
      (`src/server/start.ts:248-279`), but the separate plaintext listener still
      binds. Do not publish `3000` or `3443` to the Internet; let the edge own
      80/443 and the 301 (`docs/ops/bare-metal/network.md:115`,
      `deploy/Caddyfile:39-43`). Re-check the "Listener reality" note above
      before signing off.

- [ ] **11. Firewall ports.** Default-deny inbound; allow only SSH from the
      jump host, `80/tcp` and `443/tcp` (`docs/ops/bare-metal/network.md:30-42`).
      Private-VLAN exceptions only for Postgres/scrape ports
      (`:44-52`); anything not on the allocation table must not be exposed
      (`:26`). Re-probe from outside the allowed CIDR after every change
      (`:54`).

## Verification

Run from an external host after startup; all four must pass before declaring
the network tier ready (copied verbatim from
`docs/ops/bare-metal/network.md:168-184`):

```bash
# TLS chain + protocol
openssl s_client -connect <domain>:443 -tls1_2 -servername <domain> </dev/null 2>&1 | grep -E 'Protocol|Verify return code'

# HSTS / headers
curl -sI https://<domain> | grep -iE 'strict-transport|content-type-options|frame-options'

# Port scan from outside
nmap -sT -p 22,80,443 <public-ip>

# App health through TLS
curl -fsS https://<domain>/api/health
```

## Sources

- [`ops/bare-metal/network.md`](./bare-metal/network.md) — firewall, edge TLS,
  port allocation, verification.
- [`spec/build-deploy.md`](../spec/build-deploy.md) — containerized / reverse-proxy
  deployment path.
- `deploy/docker-compose.yml`, `deploy/Caddyfile` — canonical production stack.
- `.tmp/research/tls-startup-audit-2026-11-22.md` §3 — source of the operator
  actions and config-key citations.