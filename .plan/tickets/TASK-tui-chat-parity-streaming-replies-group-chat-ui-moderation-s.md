<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: TUI chat parity: streaming replies + group chat UI + moderation surfaces

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-terminal-ui
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Chat parity gap slice from harness-app-reuse research (index.md scenario table + gaps.md): web frontend has these chat surfaces, TUI does not. TUI chat today: ChatWidget + ChatHost (src/tui/chat/index.ts, api.ts handleSend/loadMessages/loadCommands/generateImage/uploadAsset, types.ts, commands.ts CommandCompleter, chat-picker.ts, chat-create-api.ts surfacing 403, display.ts/transcript.ts/input-field.ts). Known limits: handleSend reloads transcript after non-streaming 201 (no SSE streaming); BUG-tui-blind-to-llm-assistant-turns fixed the omitted-assistantMessage refresh; no group chat UI; no moderation surfaces; NSFW/age gating only at create.

Owner: epic-terminal-ui.md (In Progress; web parity in scope where it suits a terminal per 2026-10-16 direction). Scope warning from epic: form-heavy metadata editors, visual/graph canvases, danger-zone typed-confirm actions stay web-only — this ticket is read-mostly chat surfaces, not those.

Scope: (1) streaming replies in TUI chat (SSE or poll-while-generating; transcript.reload fallback exists today); (2) group chat UI (mentions, turn selector display, group turn order readout); (3) moderation surfaces (nsfw-moderation actions/appeals/flags/overrides/audit read views); (4) participant gating beyond create (nsfw-gate middleware + participant routes readouts); (5) turn order / party split / chat branching / VN choices display; (6) annotations + auto-translate + message translations display; (7) ownership/participant management read views; (8) message reactions/polls/search/export entry points; (9) templates beyond create-by-name; (10) story-turn transitions readout. Each sub-slice lands independently; streaming first (highest user value).

Refs: .tmp/harness-app-reuse/index.md (scenario table), .tmp/harness-app-reuse/gaps.md (gap list); src/tui/chat/api.ts; src/group-chat/; src/chat/.

Acceptance: streaming replies render incrementally in TUI transcript (no manual reload); group chat turns show speaker + turn order; moderation queues visible read-only with action entry points where terminal-safe; streaming covered by api.test.ts-style stubbed tests; bun run check green.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
