<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Agent API (RSI)

The `/api/v1/agent/*` surface is the shipped recursive-self-improvement agent
interface. Mounted by `agentApiRoutes` under `/api/v1`
(`src/agent/api/router.ts:44-107`; mount in `src/server/elysia-app.ts`). This
page documents the shipped surface only; see [the CI/CD loop](./ci-cd-loop.md)
for the check runner the `check` route drives.

## Auth model

- **Bearer, one scope per token.** Wire prefix `llra_`
  (`src/agent/api/auth.ts:38-42`); 32 random bytes → 43 unpadded base64url
  chars. `AgentTokenScope` is the four-value capability vocabulary shared by
  the DB CHECK and the `requireAgentScope` guard
  (`src/db/enums-core/agent-tokens.ts:8-22`).
- **Lifetime.** 24h default when a mint omits `ttlMs`; overrides are positive
  finite milliseconds (`src/agent/api/auth.ts:47-54`,
  `src/routes/admin/agent-tokens.ts:28-37`).
- **Storage.** Only the SHA-256 hex fingerprint is persisted
  (`hashAgentToken`, `src/agent/api/auth.ts:80-89`); plaintext exists only in
  the mint response (`src/routes/admin/agent-tokens.ts:8-14,104-105`).
- **Budgets.** 60 req/min per token, 600 req/min global, both in a 60s window
  (`AGENT_RATE_LIMITS`, `src/agent/api/auth.ts:56-63`;
  `src/agent/api/router.ts:16-17`). Global is consumed first so one token
  cannot starve the shared window (`src/agent/api/auth.ts:249-261`); 429s
  carry `X-RateLimit-*` headers (`src/agent/api/auth.ts:188-194`).
- **Fail closed.** Missing, unknown and revoked tokens all return 401; the
  message only distinguishes presence ("agent token required" vs "invalid
  agent token") (`src/agent/api/auth.ts:223-247`). An off-scope token gets
  403 "token lacks required scope" (`src/agent/api/auth.ts:275-291`).
- **Audit.** Every guarded request records `agent_actions` (`denied`,
  `rate_limited`, `forbidden`, `allowed`). Accepted requests carry an audit id
  closed with success/failure and duration by `onAfterHandle` / `onError`
  (`src/agent/api/auth.ts:221-230,293-302`; `src/agent/api/router.ts:66-88`).

| Scope tier       | Grants                                      |
| ---------------- | ------------------------------------------- |
| `agent:worktree` | spawn a TTY-free worktree                   |
| `agent:check`    | stream a check run in an owned worktree     |
| `agent:commit`   | commit sub-routes — not shipped (see below) |
| `agent:finalize` | finalize sub-routes — not shipped (see below) |

## Shipped routes

| Method | Path                      | Guard            | Request → response                                                                 |
| ------ | ------------------------- | ---------------- | ---------------------------------------------------------------------------------- |
| GET    | `/api/v1/agent/whoami`    | any valid token  | → `{ data: { tokenId, scope } }` (`src/agent/api/router.ts:89-104`)                 |
| POST   | `/api/v1/agent/worktrees` | `agent:worktree` | `{ branch, base? }` → 201 `{ data: { worktreeId, path, branch } }` (`worktree.ts:120-193`) |
| POST   | `/api/v1/agent/check`     | `agent:check`    | `{ worktreeId, gates?, timeoutMs? }` → SSE stream (`check.ts:199-259`)             |

`whoami` uses `requireAgentToken` (scope-agnostic identity probe); the other
two use `requireAgentScope` (`src/agent/api/auth.ts:308-332`).

### Worktree spawn

`POST /api/v1/agent/worktrees` runs TTY-free
`git worktree add -b <branch> <path> [<base>]` with stdin closed; it never
touches GPG state or calls `giwt gpg-unlock`
(`src/agent/api/worktree.ts:50-76,113-193`). `branch` and `base` must be plain
git ref names — no options, no `..` traversal
(`REF_RE`, `src/agent/api/worktree.ts:29-30,126-132`). The worktree lands in
`tree/agent-<uuid>/` and is registered in `rsi_agent_worktrees` with its
measured size (`src/agent/api/worktree.ts:137-158`). Sandbox caps: per-token
capacity (429 `capacity_exceeded`, `Retry-After: 60`) and a 500MB directory
cap that removes the worktree and returns 413 `worktree_too_large`
(`src/agent/api/worktree.ts:101-108,134-148`; `src/agent/api/sandbox.ts`).

### Check stream

`POST /api/v1/agent/check` resolves `worktreeId` only for the calling token
with `removed_at is null`, so another token's id is indistinguishable from an
unknown one (404) (`src/agent/api/check.ts:215-225`). `gates` is an optional
plain CSV of gate names (`GATES_RE`, `src/agent/api/check.ts:22-23,211-213`);
`timeoutMs` is clamped to 1s–30min, 10min default
(`src/agent/api/check.ts:25-27,227-230`). SSE emits one event per
`PASS:` / `FAIL:` / `SKIP:` / `ADVISORY:` verdict line plus a final event
whose status matches the child exit code; the summary reads
`.tmp/check-report.json` (`src/agent/api/check.ts:4-8,62-74,82-192`).

## Error codes

Envelopes are `{ error, code, meta }` (`jsonError`,
`src/routes/http-utils/errors.ts:35-59`); the two sandbox errors use
`{ error, message }` instead (`src/agent/api/worktree.ts:94-108`).

| Status | Code / message                                                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | `BAD_REQUEST` — "branch/base must be a plain git ref name" (`worktree.ts:131`); "gates must be a plain comma-separated gate list" (`check.ts:212`) |
| 401    | `UNAUTHORIZED` — "agent token required" / "invalid agent token" (`auth.ts:232,246`)                                                              |
| 403    | `FORBIDDEN` — "token lacks required scope" (`auth.ts:290`)                                                                                       |
| 404    | `NOT_FOUND` — "Unknown agent worktree" (`check.ts:225`)                                                                                          |
| 409    | `worktree_spawn_failed` (`worktree.ts:75`)                                                                                                       |
| 413    | `worktree_too_large` (`worktree.ts:144`)                                                                                                         |
| 429    | `capacity_exceeded` + `Retry-After: 60` (`worktree.ts:103-107`); rate limit + `X-RateLimit-*` (`auth.ts:188-194`)                               |
| 500    | `SERVER_ERROR` — "Agent context missing" / "worktree spawn failed" / "check failed to start" (`worktree.ts:124,167`; `check.ts:203,237`)        |
| 503    | `gpg_unlock_required` — unlock GPG in the agent's own session, then retry (`worktree.ts:46-48,67-72`)                                            |

## Admin token lifecycle

`POST /api/v1/admin/agent-tokens` mints and
`DELETE /api/v1/admin/agent-tokens/:id` revokes. Both require a user session
with `can("admin.system")`; agent-token principals cannot reach this surface
(`src/routes/admin/agent-tokens.ts:8-16,83-88,125-130`). Mint returns
`{ id, scope, expiresAt, token }` once — the only plaintext copy — and writes
an audit row; revoke stamps `revoked_at` (idempotent, 404 for unknown id)
(`src/routes/admin/agent-tokens.ts:92-105,132-155`). Rotation is revoke +
re-mint, never an in-place hash update
(`src/routes/admin/agent-tokens.ts:11-14`).

## Intentionally absent

Commit and finalize sub-routes (`agent:commit` / `agent:finalize`) belong to
ticket #8 and are intentionally **not** mounted — `src/agent/api/router.ts:11-14`
says so explicitly. There are no stubs or aspirational endpoints to call.
