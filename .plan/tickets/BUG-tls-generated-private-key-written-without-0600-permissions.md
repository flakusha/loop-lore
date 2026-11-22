<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: TLS generated private key written without 0600 permissions

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-certificate-and-tls-management
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

## Summary

Generated TLS private keys are written by `ensureTlsCerts()` through OpenSSL with no explicit file-mode tightening (`packages/core/src/config/cert.ts:78-95`). Under a permissive umask the private key lands world-readable, so any local user can impersonate the server.

**Context:**
Audit `.tmp/research/tls-startup-audit-2026-11-22.md` §2 (Key permissions): cert.ts:78-95 writes the key with no chmod/umask tightening. No existing ticket covers key modes: `TASK-tls-configuration-audit-and-startup-validation.md` covers key/cert match, chain, expiry and ciphers; `TASK-config-init-cli-alias-bun-run-init.md:34` covers config secrets only. Generated material is re-anchored to the runtime instance dir (`cert.ts:53-63`, `instance-path.ts:44-51`), so the fix belongs at the write site, not at callers.

## Scope

- chmod 0600 on the generated private key immediately after OpenSSL writes it; never loosen an existing key.
- Certificate file mode may stay at the default (public).
- Leave the reuse-if-both-files-exist path unchanged.
- Document the POSIX guarantee and the Windows best-effort limitation.

## Acceptance Criteria

- [ ] Generated private key has mode 0600 on POSIX, verified against a temp instance dir.
- [ ] Reusing pre-existing cert/key files does not change their modes.
- [ ] Unit test asserts the mode after generation, parallel-safe and with no real OpenSSL invocation where practical.
- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Verification

- `bun test packages/core/src/config/cert.test.ts`
- `bun run typecheck`

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
