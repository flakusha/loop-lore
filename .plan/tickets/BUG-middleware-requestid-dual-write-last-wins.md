<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: same `requestId` row dual-written by HTTP afterHandle + async LLM gen

**Status:** 🔧 In Progress (found in 2026-08-27 review; epic reopened)
**Priority:** medium
**Effort:** Small
**Epic:** epic-middleware-request-lifecycle

## Summary

The `request_results` row keyed by `requestId` is written by two independent
actors with **last-write-wins** semantics and no merge:
1. `recordLifecycle` HTTP afterHandle → `complete` (on the HTTP response).
2. `src/generation/auto-gen/auto-generation.ts` → `progress` steps then
   `fail()` on error (the async LLM generation path, fire-and-forget from
   `src/routes/messages/reply.ts:maybeAutoReply`).

For an auto-reply, the LLM generation finishes after the HTTP 200 returns, so
its `progress`/`fail` writes overwrite the `complete` written by the HTTP
afterHandle — or vice-versa. The row's terminal state is non-deterministic and
may show `failed` even when the HTTP layer succeeded (or `complete` ignoring a
generation error).

## Acceptance Criteria

- [ ] Define an authoritative writer / merge policy for the row (e.g. HTTP
      afterHandle owns terminal `complete`; async generation only writes
      `progress` + `fail` when it is the request owner).
- [ ] Test: auto-reply request → row ends in a coherent terminal state.
