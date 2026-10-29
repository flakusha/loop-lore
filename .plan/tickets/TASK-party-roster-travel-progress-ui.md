<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Party roster + travel progress UI

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Who's-where panel + long-distance travel progress (TASK-chat-branch-merge Phase 4 leftovers). No party roster or travel-progress UI exists in frontend or TUI. Work: (1) a party roster panel showing each participant's chat + current location across split branches (data: chats.parent_chat_id, chats.current_location_id, chat_participants); (2) a travel-progress indicator for long-distance movement. Closest template: the battle panel (src/frontend/battle/, tiles+focus model explicitly reusing the VN choice-card interaction model). Pure UI, no backend dependency — the /split and /reunite commands + split/reunite endpoints ship the data. See tree/c7-branch-exec/.tmp/c7-recon.md section 6.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
