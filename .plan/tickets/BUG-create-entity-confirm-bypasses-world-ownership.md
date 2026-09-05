<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: create-entity confirm bypasses world ownership

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Small

## Summary

POST /api/chats/:id/create-entity (src/routes/messages/create-entity-confirm.ts:39-109) uses checkChatAccess (:49) and insertGeneratedEntity (src/assistant/commands/create-entity.ts:49-159) writes world/location/item with client-supplied worldId, no ownership validation -> member can mint entities into any accessible world; REST location path requires requireWorldOwner (locations.ts:128). Fix: requireWorldOwner on confirm.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
