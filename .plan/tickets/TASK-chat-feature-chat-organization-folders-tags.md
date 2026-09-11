<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Chat Organization — Folders, Tags & Saved Filters

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Medium
**Type:** Feature Ticket
**Tags:** chat, feature, organization, folders, tags
**Epic:** epic-chat-product-features

## Summary

Organize the chat list into user-defined folders and tags with saved filter views. RisuAI ships `tags` + `chatFolders`; every mainstream chat UI offers list organization. Loop-lore has chat pinning (`TASK-chat-pins-frontend`) and archive search filtering (`TASK-chat-feature-archive-deletion-search`) but no folders/tags layer (research 2026-09-11).

## Acceptance Criteria

- [ ] Users can create folders and assign chats to them; a chat may live in at most one folder (or zero)
- [ ] Users can attach free-form tags to any chat; multiple tags per chat
- [ ] List sidebar supports folder tree + tag filter, combinable with the archive/live filter
- [ ] Saved filter views persist per user (e.g. "tag:campaign-x + folder:active")
- [ ] Folder/tag assignment is metadata-only: it never affects chat membership, encryption, or turn rules
- [ ] Deleting a folder relocates its chats to root, never deletes chats

## Related Epics / Tickets

- Parent: `epic-chat-product-features`
- `TASK-chat-pins-frontend` — pinning complements folders
- `TASK-chat-feature-archive-deletion-search` — search/filter pipeline consumes tags
- `epic-actors` — character-level tags precedent

## Files

- `src/chat/service/` — folder/tag CRUD
- `src/routes/` — assignment endpoints
- `src/components/chat/` — sidebar tree + tag filter

## Research Inputs

- RisuAI tags + chatFolders (deepwiki kwaroran/RisuAI, 2026-09-11)
- LibreChat `getConvosByCursor` tag filtering (deepwiki danny-avila/LibreChat, 2026-09-11)

## Open Questions

- Are folders shared (chat-admin scoped) or strictly per-user?
- Should the taxonomy variant tuples drive auto-tagging (e.g. `purpose:rpg`)?
