# TASK: Production TLS modes BYO certs ACME and proxy termination

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-certificate-and-tls-management.md

## Summary

Replace the dev-only in-place self-signed path (src/config/cert.ts ensureTlsCerts) with explicit TLS modes; forbid silent HTTP/self-signed outside development. Epic: epic-certificate-and-tls-management.md.

## Current state

- server.tls config is paths-only {key,cert} (src/config/sections/server.ts); no ca chain, passphrase, or min-TLS-version.
- Missing cert files -> openssl req -x509 RSA-2048 CN=localhost auto-generated on boot; OpenSSL absent -> warn + continue plain HTTP. No mode gating.
- Bun.serve consumes one pair shared by HTTPS and WSS transport (src/server/start.ts, src/transport/factory.ts).

## Direction

1. Config: server.tls gains mode: self-signed-dev | manual | acme | proxy (default derives from environment: development -> self-signed-dev, production -> error unless set). manual adds ca (full chain), passphrase (encrypted key), minVersion.
2. self-signed-dev: keep current generation but gated to dev/local env only; generation failure is fatal in dev-with-tls-required, not silent HTTP fallback.
3. acme mode: integrate an ACME client (e.g. via Bun-compatible lib) for Let's Encrypt issuance/renewal with HTTP-01/TLS-ALPN-01; persist account key + certs under DATA_DIR/certs.
4. proxy mode: no local TLS; require trustProxy already present in ServerConfig; document Caddy/nginx termination recipes incl. WS upgrade headers.
5. Rotation: cert reload without process restart where Bun allows (recreate listener), else documented restart hook.

## Acceptance criteria

- [ ] Mode field implemented with env-derived default; production boot errors when tls unset/mode=proxy misconfigured instead of silently serving HTTP.
- [ ] Self-signed generation impossible outside dev/local mode (config validation rejects).
- [ ] manual mode loads ca chain + passphrase-protected keys; min TLS version enforced.
- [ ] ACME mode issues and renews end-to-end against staging CA in a drill; certs persisted under DATA_DIR/certs.
- [ ] Proxy mode verified behind reverse proxy incl. WebSocket upgrade; trustProxy honored.

