<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Ambient audio route links generated assets to arbitrary messageId with no chat-membership check

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

Location: src/generation/audio-gen-route.ts:66-70 (access check gated on req.chatId only) and :136-142 (messageId link); image-gen-route.ts shares the pattern pre-existing.

Evidence: if (req.chatId) { ...checkChatAccess... } - a request carrying only messageId skips the access check entirely, and even with a valid chatId the messageId is never verified to belong to that chat or user. Any authenticated user can create asset_links rows pointing their asset at any message id in the database. The route header comment claims chat linkage is scoped to chats the caller may access (IDOR write) - the message linkage is not scoped, and the new route's replication of the old claim is what is wrong.

Verification: CODE-READ - trace: audio-gen-route.ts:60-62 (userId auth only) -> :66-70 (checkChatAccess runs ONLY under if (req.chatId)) -> :121-134 createAsset -> :136-142 linkAsset(entityType message, entityId req.messageId) with no chat-membership or ownership resolution of messageId anywhere between. Executing needs a running server + authenticated session + DB; infeasible read-only.

Impact: link-table pollution and content injection into other users' message views; asset bytes stay owner-gated, so impact is metadata-level.

Fix: resolve the message, verify message.chat_id matches the access-checked chat (or the caller owns the chat) before linking; apply the same fix in image-gen-route.ts.

Related: TASK-implement-entity-based-asset-access-via-asset-links (5596548) builds on this link table - the scoping hole should be fixed before that work lands.

Source: .tmp/glm-review/deep-landing-1015.md F-3 (gitignored; recorded here verbatim).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
