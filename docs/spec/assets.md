<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# Assets System

Status: core implemented (upload, linking, serving, visibility, sharing, signed URLs); platform extensions (dedup, renditions, GC) not started.

## Implemented

- Service — `src/assets/` + `src/assets/service/`: create/read/delete, polymorphic links, type detection, validation, file storage, thumbnails, transforms, upload encryption, tagging (`tags*.ts`), metadata extraction (`metadata.ts`), PNG text chunks (`png-text-chunk.ts`), matting routes (`matting-routes.ts`), HTTP serving (`controller.ts`, `serve-handlers.ts`, `serve-raw.ts`).
- Tables — `assets` + `asset_links` (polymorphic `entity_type`/`entity_id`/`label`) and `asset_shares` (indexed) in `src/db/migrations/001_init.ts`.
- Visibility & sharing — `private|shared|public` visibility plus per-actor share records (`src/assets/service/shares.ts`); links and shares are independent (link = where an asset belongs, share = who can see it).
- Signed URLs — `src/assets/signed-url.ts`: HMAC-SHA256 over `action:assetId:expiresAt`, default 900s expiry, constant-time verify; actions raw/download/thumb/compressed/matted.
- Storage — local UUID-derived paths (`data/assets/raw/<2-char-prefix>/`, `variant-path.ts`); limits via `ASSET_MAX_*_SIZE` / `ASSET_ALLOWED_*_TYPES` env vars.
- Media & labels — images JPEG/PNG/WebP/AVIF, audio Ogg/Opus/MP3/FLAC, video WebM/MP4; documented labels: avatar, portrait, bgm, scene, attachment, lore_image, voice_sample.

## Not implemented / aspirational

- Asset versioning (`asset_versions` table, update flow, version selector UI) — design sketch only, no code.
- Bulk share (share with a whole chat/world participant list).
- Platform batches B1–B6 of the capabilities epic: BLAKE3 dedup, `asset_renditions`/LQIP, EXIF strip, albums, orphan GC, storage budgets, backlinks API, pHash, VLM captions, RAG ingestion.
- Asset↔RAG unification: document objects, decomposers, hybrid search, gallery decomposition view.

## Epics

- `.plan/epics/epic-asset-platform-capabilities.md` — asset platform substrate; owner for the gaps above (contains the `src/assets/` current-state audit).
- `.plan/epics/epic-rag-assets-unified-storage-and-assistant-flows.md` — asset↔RAG bridge (decomposition, model roles, assistant flows).

Static-serving security requirements stand (UUID validation, `..` rejection, path containment, no symlink escape) — verify against the serve layer when touching it.
