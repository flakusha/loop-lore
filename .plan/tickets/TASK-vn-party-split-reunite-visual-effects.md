<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: VN party split/reunite visual effects

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Screen-split / scene-merge rendering for party split and reunite (TASK-chat-branch-merge Phase 3 leftovers). Today a split surfaces only as narration text + branch chats; no multi-pane or parallel-scene mode exists. Scene transitions are per-message scenes with sprite enter/exit + state.roster (src/frontend/vn/scene-renderer/). Work: a pane/overlay mode in the scene-renderer controller driven by the chat.party_split / chat.party_reunited plugin events (emitted from src/chat/service/split.ts) or the party-split/party-reunited command actions, plus a scene-merge transition on reunite. Note: chat-settings 'vn split ratio' is just a two-column layout slider, NOT a party-split feature. Novel renderer work; see tree/c7-branch-exec/.tmp/c7-recon.md section 5.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
