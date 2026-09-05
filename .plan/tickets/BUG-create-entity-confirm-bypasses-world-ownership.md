<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: create-entity confirm bypasses world ownership

**Status:** ✅ Resolved (already on dev, 2026-09-05)
**Priority:** high
**Effort:** Small

## Summary

POST /api/chats/:id/create-entity (src/routes/messages/create-entity-confirm.ts:39-109) uses checkChatAccess (:49) and insertGeneratedEntity (src/assistant/commands/create-entity.ts:49-159) writes world/location/item with client-supplied worldId, no ownership validation -> member can mint entities into any accessible world; REST location path requires requireWorldOwner (locations.ts:128). Fix: requireWorldOwner on confirm.

## Resolution

Already fixed in dev by `c95f2aec` (`fix(authz): harden generation control plane, shadow/whitenote, chat/entity/message authz`). Verified 2026-09-05 against current `dev` (`9b8c0222`):

- `src/routes/messages/create-entity-confirm.ts:47-52` — when `body.worldId` is a non-empty string, the handler calls `requireWorldOwner(database, body.worldId, actorId, ...)` before persisting; a member without world-owner rights gets the guard response.

No code change required.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
