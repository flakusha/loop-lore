<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: TUI chat parity: streaming replies + group chat UI + moderation surfaces

**Status:** Not Started
**Status Note:** 2026-11-25 reconcile: the streaming premise is STALE — SSE streaming replies shipped (`src/tui/chat/stream.ts`, wired in `src/tui/chat/api.ts:9,73`), together with branch/split/reunite (`src/tui/chat/branch-commands.ts:29-32`), the `/chars` command (`src/tui/chat/index.ts:312`) and a 31-endpoint contract pin (`src/tui/api-contract.test.ts:554-579`). Group-chat UI and moderation surfaces remain ABSENT (no group-chat/moderation hit under `src/tui/`). Scope narrowed to group-chat + moderation only.
**Priority:** medium
**Effort:** Large
**Epic:** epic-terminal-ui
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Chat parity gap slice from harness-app-reuse research (index.md scenario table + gaps.md): web frontend has these chat surfaces, TUI does not. TUI chat today: ChatWidget + ChatHost (src/tui/chat/index.ts, api.ts handleSend/loadMessages/loadCommands/generateImage/uploadAsset, types.ts, commands.ts CommandCompleter, chat-picker.ts, chat-create-api.ts surfacing 403, display.ts/transcript.ts/input-field.ts). Known limits (2026-11-25): SSE streaming replies shipped (`src/tui/chat/stream.ts`), so the old "no SSE streaming" limit is gone; BUG-tui-blind-to-llm-assistant-turns fixed the omitted-assistantMessage refresh; no group chat UI; no moderation surfaces; NSFW/age gating only at create.

Owner: epic-terminal-ui.md (In Progress; web parity in scope where it suits a terminal per 2026-10-16 direction). Scope warning from epic: form-heavy metadata editors, visual/graph canvases, danger-zone typed-confirm actions stay web-only — this ticket is read-mostly chat surfaces, not those.

Scope (2026-11-25 re-scope): (1) group chat UI (mentions, turn selector display, group turn order readout); (2) moderation surfaces (nsfw-moderation actions/appeals/flags/overrides/audit read views). Streaming replies, branch/split/reunite and `/chars` already shipped and are no longer in this ticket; the remaining sub-slices (participant gating readouts, annotations/translations, ownership read views, reactions/polls/search/export, templates beyond create-by-name, story-turn readout) are not claimed here.

Refs: .tmp/harness-app-reuse/index.md (scenario table), .tmp/harness-app-reuse/gaps.md (gap list); src/tui/chat/api.ts; src/group-chat/; src/chat/.

Acceptance (2026-11-25 re-scope): group chat turns show speaker + turn order; moderation queues visible read-only with action entry points where terminal-safe; covered by stubbed tests; bun run check green.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
