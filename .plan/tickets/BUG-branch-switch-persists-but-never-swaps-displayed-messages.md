<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Branch switch persists but never swaps displayed messages

**Status:** Done
**Priority:** high
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

SYMPTOM: Switching a branch in the chat header menu persists the switch (toast + branch list reload) but the displayed message list never changes. Even a full page reload still shows every chat message.

ROOT CAUSE: Two layers. (a) switchBranch (src/frontend/alpine/chat-branches.ts:131, via mutateBranch) reloads only the branch list, never loadMessages(); the merge modal by contrast calls window.loadMessages?.(). (b) The messages endpoint ignores chats.active_branch_id, so it is branch-unaware.

EVIDENCE: Failing run tail:
TimeoutError: waiting for locator('#message-list').getByText('branch-tip-utterance') to be hidden
  34 x locator resolved to visible `<p>`branch-tip-utterance</p>
(fail) Chat branch lifecycle (B1) > header branch menu lists branches and switching swaps the message list
with chats.active_branch_id already pointing at the mid-message branch.

FIX DIRECTION: Call loadMessages() after a successful switch, and make the messages endpoint respect chats.active_branch_id (filter/serve branch-tip messages accordingly).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue 324a2c9 (registry tip: 249d0dbbf Konstantin Fedotov Close issue)
