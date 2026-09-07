<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Federation content clearance gate: per-chat consent before mesh push

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-mesh-federation-content-sharing

## Summary

Per-chat explicit consent gate for server-to-server mesh content push (epic-mesh-federation-content-sharing Phase 2 prerequisite). Mesh membership alone MUST NOT imply clearance to replicate a chat's content. Gate checks chats.encryption_level + per-chat federation opt-in before reservation/push/duplication; e2e_sessions chain/root keys, ephemeral_private_jwk, chat_keys plaintext export, and user_api_keys plaintext MUST NEVER cross. See analysis 2026-09-08.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
