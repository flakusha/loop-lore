<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Message multi-select bulk actions

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**
Candidate-for-1.0.0 (feature-research #8, .tmp/intercom/FEATURE-RESEARCH-2026-11-11.md). Multi-select messages in the chat timeline with bulk delete / move-to-section / export-selection. Serves the operator-Required "message reaction, management, branching" leg.

**Context:**
The gallery already ships the exact pattern to copy: multi-select state, batch delete, zip download (`src/frontend/alpine/chat-types/gallery-batch-state.ts:4-8`, implemented in `chat-utils/gallery-batch.ts`; checkbox UX in `gallery-sidebar.html`). Messages have only per-message edit/delete/archive/forward/pin/reaction today. Reproduction: grep `bulkDelete|bulk-delete|multiSelect|multi-select|selectedMessageIds` over src/ matches gallery-batch only; giwt "message batch" search: no matches.

**Acceptance Criteria:**

- [ ] Selection mode in the message list (checkbox or long-press/gesture, mobile-compatible with the 44px target rules)
- [ ] Bulk delete with confirm + optimistic UI, reusing the existing per-message delete authorization per selected id (partial-failure surfaced, not silent)
- [ ] Bulk move-to-section via the existing chat-sections assign endpoint semantics
- [ ] Export selection to markdown/json via the existing chat-export formatter subset
- [ ] Encrypted chats: bulk paths go through the same decrypt/gate helpers as single-message ops — no plaintext bypass
- [ ] Unit tests: selection state reducer, bulk route authorization (cross-chat id rejected), partial-failure reporting

**Caveats:**

- Authorization must stay per-message (owner/participant checks) — a batch route MUST NOT widen access beyond what individual deletes allow.
- Read-only lane evidence; verify against dev HEAD at implementation time.
