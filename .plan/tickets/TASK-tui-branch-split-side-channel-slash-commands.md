<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: TUI branch-split-side-channel slash commands

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-conversation-branching
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

HarnessReuse Group-2 TUI slice (T5): branch/split/side-channel slash commands.

**Ground state:** Fork/branches `POST …/fork`, `…/branches`, `PATCH …/active-branch`, `GET …/branches` in `src/routes/chats/branches.ts:48-64` plus CRUD/merge in `branch-crud.ts:52-71`; party split/reunite `POST /api/chats/:id/split|/reunite` in `src/routes/chats/split.ts:43-56`; side channels `GET|POST …/side` in `side-channels.ts:38-81`; VN routes wired `src/routes/chats/index.ts:62-63`. TUI has none of it — no turn/branch/split/VN surface in `src/tui/chat/` or `src/tui/chat-picker.ts` (grep: no `turn-order|partySplit|mention` under `src/tui/`). Distinct from `TASK-assistant-server-side-branch-command` (server `/branch` assistant command delegating to `forkBranch`); this ticket owns the TUI slash-command surface calling the REST routes.

**Adopt/adapt/defer:** ADOPT bubbletea `examples/send-msg` (https://github.com/charmbracelet/bubbletea/blob/main/examples/send-msg/main.go — background completion handled in the same update switch, one render path) + gocui serialized mutation (`Gui.Update` lines 434-444, https://github.com/awesome-gocui/gocui/blob/master/gui.go — one queue in front of widget mutation; TUI async continuations at `api.ts:110-116` currently mutate with no ordering).

**Acceptance criteria:**

- [ ] `/fork`, `/branches`, `/switch <branch>`, `/split`, `/side` slash commands map 1:1 to the existing POST/PATCH/GET routes.
- [ ] Branch list renders numbered rows for `/switch`.
- [ ] Merge/delete reserved for web (explicit non-goal, documented in help text).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
