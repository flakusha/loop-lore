<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Agent API Router + Token Scope Auth

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** Not Started
**Priority:** High
**Effort:** (set per-ticket)
**Type:** Feature Task / Infrastructure
**Tags:** agent, api, auth, elysia, scope
**Epic:** epic-recursive-self-improvement

Elysia router for `/api/v1/agent/*` with scoped token auth. Mounts in `src/elysia-app.ts`. Tokens issued by admin via `POST /api/admin/agent-tokens`; scopes: `agent:worktree`, `agent:check`, `agent:commit`, `agent:finalize`.

## Core Features

- `src/agent/api/router.ts` — Elysia router with sub-routes for tasks, worktrees, check, commit, finalize
- `src/agent/api/auth.ts` — `requireAgentScope(scope: string)` Elysia `beforeHandle`; checks `Authorization: Bearer <token>` against `agent_tokens` table
- Token storage: SHA-256 hash of token in DB (never plaintext); rotation via admin route
- Rate limit reuse: `src/middleware/rate-limit.ts` keyed on token id

## Acceptance Criteria

- [ ] Router mounted; sub-routes (#6, #7, #8) hang off it
- [ ] `requireAgentScope('agent:worktree')` rejects requests without valid scope with 403
- [ ] Tokens are SHA-256 hashed at rest; plaintext never persisted
- [ ] Admin route `POST /api/admin/agent-tokens` mints a new token with chosen scope; rotated via `DELETE /api/admin/agent-tokens/:id` + re-mint
- [ ] Rate limit: 60 req/min per token; 600 req/min global

## Files

- `src/agent/api/router.ts` — new
- `src/agent/api/auth.ts` — new
- `src/agent/api/auth.test.ts` — new
- `src/db/migrations/NNN_rsi_agent_tokens.ts` — new (companion to #9)
- `src/elysia-app.ts` — mount

## Notes / Verification

- Reuse `src/crypto/hasher.ts` for SHA-256 (already adopted `Bun.CryptoHasher` per `11a6c0dd`).
- Reuse `src/middleware/auth/` patterns for the beforeHandle; token is bearer not session.
- Per `AGENTS.md` security review (2026-08-25): never log raw tokens; log only the SHA-256 prefix.

