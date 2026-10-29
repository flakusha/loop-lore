<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: egui frontend buttons for party split/reunite (parity with /split /reunite commands)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Add Split and Reunite buttons in the egui frontend's chat view (native/loop-lore-egui/src/app.rs — the one-screen chat client: chat list, transcript, composer) calling the same REST endpoints the /split and /reunite chat commands use (src/assistant/commands/split.ts, src/assistant/commands/reunite.ts; branch-spec validation src/chat/service/split-validate.ts): POST /api/v1/chats/:id/split and POST /api/v1/chats/:id/reunite (src/routes/chats/split.ts), added in commit 165983c0d (branch c7-branch-exec).

Split: an egui-native form/window collecting at least 2 branch groups, each a location picker limited to the chat's world locations plus an actor multi-select limited to the chat's participants — the same constraints validateBranchSpecs enforces server-side (src/chat/service/split-validate.ts). Reunite: a picker of the chat's child branches (parent_chat_id = current chat), then POST /api/v1/chats/:id/reunite.

Follow the crate's existing seams: requests via crate::client (cookies/CSRF handled once), JSON parsing in crate::api, status-line/error surfacing like the existing send/attach_asset paths in app.rs; pure state machines host-tested like gallery.rs/stream.rs where feasible. Success/error feedback mirrors the commands' systemMessages. Related: epic-chat-transfer-location, TASK-chat-branch-merge, epic-experimental-egui-frontend.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
