<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Federation DEK re-wrap protocol: server-to-server key export

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-mesh-federation-content-sharing

## Summary

Define the server-to-server DEK export protocol for mesh content sharing (epic-mesh-federation-content-sharing Phase 2). chat_keys.encrypted_chat_key MUST NOT be copied verbatim to peers; re-wrap under peer clearance after the per-chat consent gate passes. Covers: re-wrap API, recipient binding, rotation on peer removal, audit log. Blocks encrypted duplication/reservation of non-at-rest tiers.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
