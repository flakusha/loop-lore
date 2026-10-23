<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: fix(server): fail closed when configured TLS certs cannot be provisioned

**Status:** Done
**Status Note:** fixed on this branch — when `server.tls` is configured and the certificates cannot be provisioned, the server logs a fatal error and aborts startup instead of continuing HTTP-only (`src/server/start.ts:146-159`). Regression test in src/server/start.test.ts ("fails closed when the configured TLS certs cannot be provisioned").
**Priority:** high
**Effort:** Medium
**Epic:** epic-certificate-and-tls-management

**Summary:**

Sources: stream-a #9. Where: src/server/start.ts:131-146 (else warn HTTPS unavailable - serving HTTP only). Gap: when config.server.tls is set but ensureTlsCerts returns falsy, the server only warns and continues HTTP-only. An operator who explicitly requested TLS gets plaintext without a fail-closed signal. Acceptance: configured-TLS + provisioning failure throws/exits non-zero; warn-and-continue remains only when TLS was never configured. A start test covers the falsy-cert path. Priority: high - silent plaintext downgrade against explicit operator intent.

**Context:**

`ensureTlsCerts()` returns null when the cert files are missing and OpenSSL cannot generate them; the server only warned and served plaintext, so an operator who explicitly configured TLS silently got an unencrypted server. Fail-closed belongs at the call site that knows whether TLS was requested: `ensureTlsCerts` keeps returning null (its own unit tests assert that contract) and `start()` decides. The certificates are now provisioned before any listener opens, so the failure happens before traffic is served and the process exits non-zero. Alternative considered: throwing inside `ensureTlsCerts` — rejected, that helper cannot know whether the caller wanted HTTPS or merely probed for certs. Docs updated: `src/config/cert.ts` (no more "falling back to HTTP only") and `docs/spec/users-sessions.md`.

**Acceptance Criteria:**

- [x] Configured TLS + provisioning failure aborts startup with a fatal log and a non-zero exit
- [x] No plaintext listener is opened when the configured TLS certs are unavailable
- [x] The unconfigured-TLS path is unchanged (HTTP only, no failure)
- [x] Regression test covers the falsy-cert path (fails before the fix, passes after)
- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

**Resolution:**

- Root cause: the `else` branch in `start()` only logged "HTTPS unavailable — serving HTTP only" and continued, so an explicit TLS configuration degraded silently to plaintext.
- Changed `src/server/start.ts:146-159` (provision the certs before the listener opens; fatal log + throw when `config.server.tls` is set and the certs are unavailable).
- Docs: `src/config/cert.ts:5-9`, `:87`; `docs/spec/users-sessions.md:105`.
- Regression test: `src/server/start.test.ts` — "fails closed when the configured TLS certs cannot be provisioned" (2 pass / 3 fail before the fix, 5 pass / 0 fail after).
