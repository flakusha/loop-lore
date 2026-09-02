<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Assistant Asset Access Commands

**Status:** 📝 Not Started
**Priority:** High
**Effort:** Medium
**Type:** Task
**Tags:** assistant, assets, gallery, search
**Related:** `epic-assistant-entity-access.md`, `epic-asset-platform-capabilities.md`

## Summary

Implement assistant slash commands for asset browsing, preview, search, and linking: `/asset-list`, `/asset-preview`, `/asset-search`, `/asset-link`. Enables the user to manage and reference assets through the assistant.

## Motivation

Users need to browse and reference their assets (uploaded images, generated renders) without leaving the chat. The assistant should be able to list assets, preview them, search by description, and link them to documents or messages.

## Design

### Commands

| Command | Subcommands | Description |
|---|---|---|
| `/asset-list [kind]` | `[kind]` | Gallery-style asset grid with thumbnails |
| `/asset-preview <asset-id>` | — | Full asset + metadata + links + renditions |
| `/asset-search <query>` | — | FTS5 + pHash hybrid search over assets |
| `/asset-link <msg\|asset> <doc>` | — | Link asset to document; tooltip chip in chat |

### Asset List

Returns paginated assets owned by the user (or shared/public). Supports filtering by kind (image, video, audio, file). Reuses `src/assets/` service layer and `asset_links` table.

### Asset Preview

Shows asset metadata (dimensions, MIME, size, hash), links (messages, characters, worlds, documents), and available renditions. Reuses `src/assets/controller/` and `signed-url.ts`.

### Asset Search

Hybrid search combining:
1. FTS5 over asset metadata (filename, description, alt text)
2. pHash perceptual similarity (when `epic-asset-platform-capabilities.md` B4 lands)
3. Tag filter

### Asset Link

Sets `documents.source_asset_id` and creates an `asset_links` row. Frontend shows a `🧠 Linked` chip on the associated message/asset.

## Tasks

- [ ] Implement `assetListHandler` — Paginated asset grid with kind filter
- [ ] Implement `assetPreviewHandler` — Full asset preview with metadata and links
- [ ] Implement `assetSearchHandler` — FTS5 + pHash hybrid search
- [ ] Implement `assetLinkHandler` — Link asset to document
- [ ] Register all commands in the assistant command registry
- [ ] Quota enforcement for search operations
- [ ] Unit tests for all handlers

## Acceptance Criteria

- [ ] `/asset-list` returns paginated assets with thumbnails
- [ ] `/asset-preview` shows full metadata + links
- [ ] `/asset-search` returns ranked assets
- [ ] `/asset-link` creates asset_links row and updates document source_asset_id
- [ ] Quota enforcement blocks search when exceeded
- [ ] Unit tests pass

## Files

- `src/assistant/commands/assets.ts` — Command handlers
- `src/assistant/adapter/assets.ts` — Asset adapter composing with `src/assets/` service

## Dependencies

- `epic-asset-platform-capabilities.md` — Asset platform, signed URLs, asset_links
- `epic-assistant-entity-access-schema` — EntityAdapter interface
