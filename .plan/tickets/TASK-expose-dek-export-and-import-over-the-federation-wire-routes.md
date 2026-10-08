<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Expose DEK export and import over the federation wire routes

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-local-multi-instance-federation

**Summary:**

exportChatDekForPeer (src/federation/dek-rewrap.ts:73) and importChatDek (src/federation/dek-rewrap.ts:184) are fully implemented, tested, and type-bound to a ChatClearance that only authorizeChatExport can mint (src/federation/clearance.ts:20-22) - so the export path is structurally unbypassable. But neither has a wire route, so encrypted-tier chats cannot span instances and are rejected as tier-not-exportable. Add routes that export a DEK under peer clearance and import a rewrapped DEK on the receiving side. The type-level clearance binding must be preserved end to end: no route may construct a clearance without going through authorizeChatExport, and encrypted_chat_key must never be copied verbatim to a peer. Acceptance: an encrypted-tier chat federates end to end; the receiving instance imports the DEK and reads the content; a chat without clearance is still refused with tier-not-exportable; revokeDekExportsForPeer still works through the new routes.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
