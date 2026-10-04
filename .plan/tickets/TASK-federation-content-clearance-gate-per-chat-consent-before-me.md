<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Federation content clearance gate: per-chat consent before mesh push

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-mesh-federation-content-sharing

## Summary

Per-chat explicit consent gate for server-to-server mesh content push (epic-mesh-federation-content-sharing Phase 2 prerequisite). Mesh membership alone MUST NOT imply clearance to replicate a chat's content. Gate checks chats.encryption_level + per-chat federation opt-in before reservation/push/duplication; e2e_sessions chain/root keys, ephemeral_private_jwk, chat_keys plaintext export, and user_api_keys plaintext MUST NEVER cross. See analysis 2026-09-08.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-04 registry-driven close: git issue 41f4f83 (registry tip: e82ef845e Konstantin Fedotov Auto-closed: appended .md marker marks TASK-FEDERATION-CONTENT-CLEARANC)
