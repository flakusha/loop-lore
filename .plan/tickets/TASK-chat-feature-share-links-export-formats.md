<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Chat Share Links & Export Formats

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Medium
**Type:** Feature Ticket
**Tags:** chat, feature, sharing, export, privacy
**Epic:** epic-chat-product-features

## Summary

Stable read-only share links for chats plus export in multiple formats. Comparable platforms (LibreChat `share.ts` + ShareButton; SillyTavern JSONL/text export) both ship this; loop-lore has history import/export (`TASK-chat-history-import-export`) but no share-link or per-format export surface (research 2026-09-11).

## Acceptance Criteria

- [ ] Owner can mint a stable read-only share link; revoking it invalidates all prior link access
- [ ] Shared view respects encryption: shared chats are decrypted server-side only for authorized link holders, or sharing is blocked for E2E variants (3/4/5)
- [ ] Share respects NSFW gate and moderation state (flagged content is not exposed via links)
- [ ] Export formats: JSON (full fidelity), markdown/text (readable transcript); assets referenced by link, not embedded
- [ ] Export excludes shadow notes and GM carriage (per `TASK-chat-feature-notes-shadow-carriage` shareability rules)
- [ ] Archived chats remain exportable by owner/admin

## Related Epics / Tickets

- Parent: `epic-chat-product-features`
- `TASK-chat-history-import-export` — import/export groundwork
- `TASK-chat-feature-archive-deletion-search` — archived-state export
- `TASK-chat-feature-notes-shadow-carriage` — exclusion rules
- `epic-chat-privacy` / `epic-frontend-encryption` — E2E sharing constraint

## Files

- `src/routes/` — share-link endpoints
- `src/chat/service/` — export serialization
- `src/crypto/` — link-token authorization

## Research Inputs

- LibreChat share links + export (deepwiki danny-avila/LibreChat, 2026-09-11)
- SillyTavern JSONL/text export (deepwiki, 2026-09-11)

## Open Questions

- Do share links expire by default?
- Should shared views render VN-style formatting or plain transcript?
