<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Assistant Asset Access Commands

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** In Progress
**Status Note:** In Progress (verified 2026-10-18 against `dev` at `08ef7efe7`). Three of the six acceptance criteria are met. Met: `/asset-list` returns the owner's visible assets with thumbnails and a validated `kind` filter (`src/assistant/commands/assets.ts:22`, tested at `assets.test.ts:154` and `:168`); `/asset-preview` shows full metadata plus links (`assets.ts:61`, tested at `assets.test.ts:207`, with the Alt/Links omission branches pinned at `:239`); `/asset-search` returns ranked assets (`assets.ts:99`, tested at `assets.test.ts:247` and the multi-word join at `:266`); all three are registered for real because the file is imported by the command barrel (`src/assistant/commands/index.ts:9`), asserted by `assets.test.ts:128`; and unit tests pass including access-denial cases (`assets.test.ts:189`, `:226`, `:273`). NOT MET: (a) `/asset-link` is not registered as an assistant command — `registerCommand` is called exactly three times (`assets.ts:22`, `:61`, `:99`), so no `/asset-link` handler exists in the assistant command surface. Note the underlying capability DOES ship outside the assistant: `asset_links` rows are written by the assets controller (`POST /api/assets/:assetId/links`, exercised in `src/assets/controller.routes.test.ts:381`), called from the chat `link-asset` action (`src/frontend/alpine/chat-actions/dispatch.ts:105`) and the gallery (`src/frontend/alpine/chat-utils/gallery.ts:180`). What is genuinely missing is the documented second half — a `source_asset_id` column on `documents` does not exist (grep across `src/db/` returns nothing), so the command's stated contract could not be met as written even if the handler were added; (b) quota enforcement does not exist — there is no `src/assistant/quota/` directory and no `QuotaExceededError` in `src/`, so nothing is blocked pre-call; (c) `/asset-search` delegates to the shared `searchAssets` service (`src/search/`, FTS5 + vector fusion via `reciprocalRankFusion`) rather than the specified FTS5 + pHash hybrid — perceptual hashing does not appear in `src/search/` at all. Remaining: the link handler, the quota engine, and either pHash support or an amendment of the design.
**Priority:** High
**Effort:** Medium
**Type:** Task
**Tags:** assistant, assets, gallery, search
**Epic:** epic-assistant-entity-access
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
