<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: assistant server-side /branch command

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-conversation-branching
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Register a server-side `/branch [name]` assistant command so chat branching is
reachable from every client (TUI, API, plain message box), not just the web
frontend. Source: assistant integration review 2026-10-23 (gap 5 / rec 5).

**Context:**

`/branch` exists only client-side: `interceptSlashSend` in
`src/frontend/alpine/chat-slash.ts` handles `/continue`, `/retry`, `/branch`
@101-105 before the message ever reaches the server. The branch backend is
ready — `forkBranch` at `src/chat/service/branches.ts` — but a full
enumeration of `src/assistant/commands/` shows no `branch.ts`, so TUI and API
clients cannot fork a conversation.

**Approach**

- New `src/assistant/commands/branch.ts`: `registerCommand` delegating to
  `forkBranch` (chatId from the dispatch context, optional name arg).
- Register via the side-effect import list in `src/assistant/commands/index.ts`
  (pattern: `/translate` at index.ts:41).
- Works in group chats automatically: `dispatchCommand`
  (`src/routes/messages/create.ts:139`) runs for all chat types and strips the
  `@Name` mention prefix (`command.ts:194-198`) before parsing.
- Retarget the frontend `chat-slash.ts` `/branch` at the server command (or
  keep it as the interactive variant) to remove the dual spelling
  (frontend `/branch` vs REST `/branches` vs `/fork` alias — review gap 9).

**Acceptance Criteria:**

- [ ] `/branch [name]` forks the current chat via `forkBranch` in single chat
- [ ] Same command works in group chat through `dispatchCommand` (mention-prefixed)
- [ ] Frontend client-only `/branch` no longer diverges from the server behavior
- [ ] Unit tests: dispatch → forkBranch called with chatId + name; role gate applies
- [ ] Role gate verified against `getCommandRequirement`/`satisfiesRole` (registry.ts:139/102)
