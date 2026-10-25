<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: BYO decrypt failure silently falls back to server key

**Status:** Done
**Status Note:** resolved 2026-10-25 (`fix/bug-sweep`) — userApiKeyResolver no longer degrades to the server key on decrypt failure: it warn-logs (provider+userId, never key material) and throws the new typed `ByoKeyDecryptError` (src/generation/providers/user-api-key.ts:22-43, throw at :103). DECISION (per fix direction): fail the request with a clear error rather than silently billing the server key — `resolveProvider` awaits the resolver during option resolution (src/generation/providers/registry.ts:130) and `callWithFailover` awaits it outside the per-attempt try (src/generation/providers/call-with-failover.ts:90-92), so the throw aborts BEFORE any vendor call and never triggers vendor failover on the server key. Legitimate "no key" paths (no row, BYO off, allowUserApiKey:false) still return undefined — only an existing-but-undecryptable key throws. Repros in src/generation/providers/user-api-key.test.ts: corrupt ciphertext now `rejects.toThrow(ByoKeyDecryptError)` (was: the old "degrades to undefined" test passed at HEAD, documenting the old silent-billing behavior; the new test could not even resolve `ByoKeyDecryptError` before the fix) + provider-named/never-key-material assertion. 7/7 pass. Gates: typecheck + eslint green (run 740507-mvngmtfl), worktree fix/bug-sweep, issue BUG-BYO-DECRYPT-FAILURE-SILENTLY-FALLS-BACK-TO-SERVER-KEY.
**Priority:** high
**Effort:** Medium
**Epic:** epic-byok-api-keys
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Decrypt failure (wrong/rotated encryptionKey, corrupt row) only warn-logs (registry.ts:136-144); user believes their key used while server key billed. Fix: surface 4xx/flag to caller or emit metric + user-visible warning.

**Context:**

Closure rationale (2026-10-25, branch `fix/bug-sweep`): userApiKeyResolver no longer degrades to the server key on decrypt failure: it warn-logs (provider+userId, never key material) and throws the new typed `ByoKeyDecryptError` (src/generation/providers/user-api-key.ts:22-43, throw at :103).

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-25 registry-driven close: git issue f06f2d2 (registry tip: dee54e99e Konstantin Fedotov Close issue)
