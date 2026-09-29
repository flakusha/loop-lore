<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Agent Token Lifecycle — Issuance, Rotation, Revocation

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** Not Started
**Priority:** High
**Effort:** Medium
**Type:** Feature Task / Security
**Tags:** agent, auth, token, rotation, crypto
**Epic:** epic-recursive-self-improvement

Scoped agent token lifecycle per epic Open Question #1 (scoped tokens, 24h TTL): issuance, rotation, revocation on `src/crypto/`, enforced by agent auth.

## Core Features

- `src/agent/api/tokens.ts` — `issueToken(scopes, ttl=24h)`, `rotateToken(old)`, `revokeToken(id)`; random 256-bit via `src/crypto/`, stored as SHA-256 hash only.
- Scopes `agent:worktree`, `agent:check`, `agent:commit`, `agent:finalize`, `agent:tickets` enforced by #5 `src/agent/api/auth.ts`.
- Revocation list checked per request; rotation atomically invalidates old token.
- Admin list (hash-prefix only, never plaintext) + revoke; lifecycle events land in `agent_actions` (#9).

## Acceptance Criteria

- [ ] Issued tokens expire after 24h TTL; expired token gets 401
- [ ] Rotation atomically invalidates old token; no window where both work
- [ ] Revoked token rejected within one request (no stale cache)
- [ ] Only SHA-256 hashes stored; plaintext appears only in single issue response
- [ ] Unit tests for issue/rotate/revoke/expiry; integration test for scope enforcement

## Files

- `src/agent/api/tokens.ts` — new
- `src/agent/api/tokens.test.ts` — new
- `src/crypto/` — reuse token generation (no new dep)
- `src/agent/api/auth.ts` — enforce scopes + revocation (extends #5)

## Notes / Verification

- Depends on #5 (router + auth scope) and #9 (audit sink).
- NEVER store passphrase server-side; signing stays agent-side per `AGENTS.md` GPG constraint.


git issue: 820ebec
