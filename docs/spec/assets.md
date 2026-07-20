> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# Assets System

## Overview

Assets replace the old "Gallery" concept. An asset is any media file — image, audio, video, or other — uploaded by a user and linkable to any entity in the system (chat, character, user, world, message).

Design goals:

1. **One table for all media** — no separate tables for images/audio/video
2. **Polymorphic linking** — any asset links to any entity type
3. **Flexible storage** — local filesystem or object store (S3/GCS) via config
4. **Optimized serving** — pre-compressed variants, resizing, caching

## Supported Media Types

### Images

| Format | MIME       | Notes                               |
| ------ | ---------- | ----------------------------------- |
| JPEG   | image/jpeg | Photos, high compression            |
| PNG    | image/png  | Lossless, transparency              |
| WebP   | image/webp | Modern, lossy + lossless, preferred |
| AVIF   | image/avif | Next-gen, not always supported      |

- Raw + compressed PNG/WebP stored alongside originals
- Thumbnails auto-generated on upload

### Audio

| Format     | MIME       | Notes                         |
| ---------- | ---------- | ----------------------------- |
| Ogg Vorbis | audio/ogg  | Open format, widely supported |
| Opus       | audio/opus | Best quality/bitrate ratio    |
| MP3        | audio/mpeg | Universal compatibility       |
| FLAC       | audio/flac | Lossless, large               |

- Primary use: character voice samples, atmosphere/environment sounds, narration

### Video

| Format | Codec      | Notes                                       |
| ------ | ---------- | ------------------------------------------- |
| WebM   | VP9/AV1    | Open, web-optimized                         |
| MP4    | H.264      | Universal fallback                          |
| MP4    | H.265/HEVC | Better compression, hardware support varies |

- Video assets primarily for web UI; TUI can show metadata only

## Asset Storage

### Local Filesystem (Default)

Assets are stored on disk using a UUID-derived path scheme to avoid inode limits. Path construction:

### Object Store (S3/GCS)

```
bucket/
  assets/
    raw/abcd1234.jpg
    compressed/abcd1234.webp
    compressed/abcd1234_thumb.webp
```

Configured via:

```
ASSET_STORAGE_BACKEND=s3       # local (default), s3, gcs
ASSET_S3_BUCKET=my-bucket
ASSET_S3_REGION=us-east-1
ASSET_S3_ENDPOINT=https://...  # for MinIO/compatible
```

> **Warning**: `ASSET_STORAGE_BACKEND` defaults to `local` if unset. Static server deployments must provide a base path for default assets (e.g., `data/assets/`). All assets must be persisted in the `assets` table; storage path follows `UUID/first-2-chars` scheme. Validate upload limits via env vars (`ASSET_MAX_IMAGE_SIZE`, `ASSET_MAX_AUDIO_SIZE`, `ASSET_MAX_VIDEO_SIZE`) — no hardcoded defaults in code.

## Upload & Processing Pipeline

An asset upload proceeds through these steps:

1. **Upload** — Client sends `POST /api/assets` with multipart form data (`file`, `alt_text?`)
2. **Validation** — Server checks file size, MIME type, and extension against allowed lists (`ASSET_MAX_IMAGE_SIZE`, `ASSET_ALLOWED_IMAGE_TYPES`, etc.)
3. **Storage** — Server generates UUID, stores raw file to `data/assets/raw/{uuid-prefix}/{uuid}.{ext}`
4. **Background processing** (async, per asset type):
   - **Images**: Generate WebP compressed variant (q=85) + 256px thumbnail WebP
   - **Audio**: Optionally transcode to Opus 96kbps
   - **Video**: Optionally generate poster frame JPEG
5. **DB write** — Asset record inserted into `assets` table with metadata (filename, mime, size, type)
6. **Response** — Returns `201 Created` with asset ID and URLs (`raw`, `compressed`, `thumbnail`)

### Compression Strategy

| Asset Type | Compressed Variants               |
| ---------- | --------------------------------- |
| Image      | WebP (q=85), thumbnail 256px WebP |
| Audio      | Opus 96kbps (if not already)      |
| Video      | Poster frame JPEG, thumbnail      |

## Asset Linking (Polymorphic)

Assets are not directly tied to a single entity. Instead, `asset_links` junction table maps assets to any entity. Examples of how the same asset connects to different entities using `entity_type`, `entity_id`, and `label`:

| Asset            | Links To         | Label      | Purpose              |
| ---------------- | ---------------- | ---------- | -------------------- |
| `portrait.webp`  | `character` uuid | `portrait` | Character portrait   |
| `bgm.opus`       | `world` uuid     | `ambient`  | Background music     |
| `screenshot.png` | `chat` uuid      | `scene`    | Scene illustration   |
| `avatar.jpg`     | `user` uuid      | `avatar`   | User profile picture |

This replaces the old Gallery model where items had fixed `chat_id`/`character_id` columns.

### Use Cases

| label        | entity_type | Purpose                             |
| ------------ | ----------- | ----------------------------------- |
| avatar       | user        | User profile picture                |
| portrait     | character   | Character portrait / sprite         |
| bgm          | world       | Background music for world          |
| scene        | chat        | Scene illustration for chat context |
| attachment   | message     | File attached to specific message   |
| lore_image   | world       | Illustration in world lore          |
| voice_sample | character   | Character voice (TTS)               |

## API Endpoints

### Upload

```
POST /api/assets
Content-Type: multipart/form-data
  file: <binary>
  alt_text?: string

Response: 201
{
  "id": "uuid",
  "filename": "portrait.png",
  "mime_type": "image/png",
  "asset_type": "image",
  "size_bytes": 123456,
  "urls": {
    "raw": "/api/assets/uuid/raw",
    "compressed": "/api/assets/uuid/compressed",
    "thumbnail": "/api/assets/uuid/thumb"
  }
}
```

### List

```
GET /api/assets?entity_type=character&entity_id=char-uuid&label=portrait

Response: 200
[{ ...asset objects... }]
```

### Link

```
POST /api/assets/:id/link
{
  "entity_type": "character",
  "entity_id": "char-uuid",
  "label": "portrait"
}

Response: 201
```

### Unlink

```
DELETE /api/assets/:id/link
Body: { "entity_type": "character", "entity_id": "char-uuid" }

Response: 204
```

### Delete

```
DELETE /api/assets/:id

Response: 204
(Removes file from storage + all links)
```

### Serve

```
GET /api/assets/:id/raw       → Original file
GET /api/assets/:id/compressed → Compressed variant
GET /api/assets/:id/thumb     → Thumbnail
```

## Serving Assets

- Static file serving via Bun's built-in server
- `GET /api/assets/:id/raw` → reads from storage, sets correct Content-Type
- Cache headers: `Cache-Control: public, max-age=31536000, immutable`
- Pre-compressed variants served when available
- If asset is private (future), check session token

## Asset Validation

| Check               | Limit                 | Config                      |
| ------------------- | --------------------- | --------------------------- |
| Max image size      | 20 MB                 | `ASSET_MAX_IMAGE_SIZE`      |
| Max audio size      | 100 MB                | `ASSET_MAX_AUDIO_SIZE`      |
| Max video size      | 500 MB                | `ASSET_MAX_VIDEO_SIZE`      |
| Allowed image types | jpeg, png, webp, avif | `ASSET_ALLOWED_IMAGE_TYPES` |
| Allowed audio types | ogg, opus, mp3, flac  | `ASSET_ALLOWED_AUDIO_TYPES` |
| Allowed video types | webm, mp4             | `ASSET_ALLOWED_VIDEO_TYPES` |

## Asset Visibility Model

Every asset has a visibility state controlling who can discover and access it.
Visibility is orthogonal to linking — an asset can be linked to an entity but
still restricted in who can view it.

### Visibility States

| State     | Meaning                                                          |
| --------- | ---------------------------------------------------------------- |
| `private` | Only the owner (`uploaded_by`) can view, download, or link.      |
| `shared`  | Owner plus explicitly listed actors/users can view and download. |
| `public`  | Any authenticated user can discover, view, and download.         |

**Default:** `private` on upload.

### State Machine

```
private ↔ shared ↔ public
```

All transitions are bidirectional and always allowed. The owner or an admin
can change visibility at any time. Changing from `public` to `private`
immediately revokes access for non-owners (previously cached URLs continue
working until TTL expires — serving layer checks visibility on each request
for non-immutable endpoints).

### Access Control Matrix

| Actor           | `private`                 | `shared`        | `public`          |
| --------------- | ------------------------- | --------------- | ----------------- |
| Owner           | Full (view/download/link) | Full            | Full              |
| Listed in share | —                         | View + download | View + download   |
| Other user      | —                         | —               | View + download   |
| Admin           | Full (override)           | Full (override) | Full              |
| Unauthenticated | —                         | —               | — (auth required) |

### Visibility and Linking Interaction

Linking an asset to an entity does not change its visibility. The asset's
visibility gate is checked independently of the link:

- A `private` asset linked to a `public` world is still only visible to the owner and explicitly shared actors. Users viewing the world see the link exists but cannot access the asset file.
- A `public` asset linked to a `private` chat is accessible to anyone who can view the asset directly, but the chat itself remains private.

This separation lets users control media access independently of entity access.

### API: Change Visibility

```
PATCH /api/assets/:id
{
  "visibility": "shared"
}

Response: 200
{ "id": "uuid", "visibility": "shared" }
```

---

## Asset Sharing Between Actors

Sharing makes a specific asset visible to specific actors without making it
public. This is the mechanism behind "send image to friend" or "share map
with party" workflows.

### How Sharing Works

1. **Share:** Owner calls `POST /api/assets/:id/share` with the target actor.
   Server creates a record in `asset_shares`.
2. **Unshare:** Owner calls `DELETE /api/assets/:id/share` with the target
   actor. Server removes the sharing record.
3. **Visibility update:** When the first share is created and asset is
   `private`, visibility automatically transitions to `shared`. When all
   shares are removed, visibility stays `shared` (owner must explicitly
   revert to `private`).

### Sharing vs Linking

| Concept   | Purpose                                         | Table          | Direction      |
| --------- | ----------------------------------------------- | -------------- | -------------- |
| **Link**  | "This asset belongs to / describes this entity" | `asset_links`  | Asset → Entity |
| **Share** | "This actor may view/download this asset"       | `asset_shares` | Asset → Actor  |

A link says where an asset lives. A share says who can see it. They are
independent — you can link without sharing, share without linking, or both.

### Sharing Table

Table: `asset_shares` — new table, added in a future migration.

| Column           | Type | Constraints               | Notes                  |
| ---------------- | ---- | ------------------------- | ---------------------- |
| `id`             | TEXT | PK, UUID                  |                        |
| `asset_id`       | TEXT | FK → assets.id, NOT NULL  | The asset being shared |
| `shared_with_id` | TEXT | FK → actors.id, NOT NULL  | Who receives access    |
| `shared_by_id`   | TEXT | FK → actors.id, NOT NULL  | Who granted access     |
| `created_at`     | TEXT | DEFAULT CURRENT_TIMESTAMP |                        |

**Indexes:** `(asset_id)`, `(shared_with_id)`, `(asset_id, shared_with_id)` unique.

### API Endpoints

```
POST /api/assets/:id/share
Body: { "actor_id": "target-actor-uuid" }
Response: 201

DELETE /api/assets/:id/share
Body: { "actor_id": "target-actor-uuid" }
Response: 204

GET /api/assets/:id/shares
Response: 200
[
  {
    "id": "share-uuid",
    "shared_with": { "id": "actor-uuid", "display_name": "Alice" },
    "shared_by": { "id": "actor-uuid", "display_name": "Bob" },
    "created_at": "2026-01-15T10:30:00Z"
  }
]
```

### Bulk Share (Future)

For sharing an asset with an entire chat or world participant list:

```
POST /api/assets/:id/share
Body: { "chat_id": "chat-uuid" }
Response: 201
(creates share records for all chat participants)
```

---

## Static File Serving Security

Static asset serving must prevent path traversal attacks. A maliciously
crafted request could attempt to read files outside the assets directory
(e.g., `/api/assets/../../etc/passwd`).

### Requirements

1. **Path canonicalization** — resolve the requested path to an absolute
   canonical form before serving. Reject if the canonical path does not
   start with the configured assets root directory.
2. **Reject `..` segments** — any path containing `..` after UUID resolution
   must be rejected with `400 Bad Request`.
3. **UUID validation** — asset IDs must be valid UUIDs before path
   construction. Non-UUID input is rejected early.
4. **No symlink following** — do not follow symlinks that point outside the
   assets root. Either reject or resolve to the symlink target and check
   containment.
5. **Storage backend parity** — S3/GCS backends use key-based access (no
   filesystem traversal risk), but key construction must still validate the
   asset ID format.

### Implementation Pattern

```
function safeAssetPath(assetId: string, variant: string): string {
  // 1. Validate UUID format
  if (!isValidUUID(assetId)) throw new BadRequestError("Invalid asset ID");

  // 2. Construct path using UUID prefix scheme
  const prefix = assetId.slice(0, 2);
  const path = join(ASSETS_ROOT, variant, prefix, assetId);

  // 3. Canonicalize and check containment
  const canonical = realpathSync(path);  // resolves symlinks
  if (!canonical.startsWith(ASSETS_ROOT)) {
    throw new BadRequestError("Path traversal detected");
  }

  return canonical;
}
```

---

## Asset Versioning (Draft)

> **Status:** Design sketch. Not implemented. Will be touched later.

Assets can be updated (character portrait revised, map updated, audio
replaced). Versioning tracks the history of changes without losing prior
versions.

### Model

Each asset has a `version` integer (starts at 1). When an asset is updated
(replaced file), the existing record is archived and a new version is created.

### Version Table (Proposed)

Table: `asset_versions`

| Column       | Type    | Notes                                    |
| ------------ | ------- | ---------------------------------------- |
| id           | TEXT    | PK, UUID                                 |
| asset_id     | TEXT    | FK → assets.id                           |
| version      | INTEGER | Sequential version number                |
| filename     | TEXT    | Original filename at this version        |
| mime_type    | TEXT    | MIME type at this version                |
| size_bytes   | INTEGER | File size at this version                |
| storage_path | TEXT    | Path to this version's file              |
| created_by   | TEXT    | FK → actors.id                           |
| created_at   | TEXT    | DEFAULT CURRENT_TIMESTAMP                |
| changelog    | TEXT    | Optional note: "Updated face, added hat" |

**Index:** `(asset_id, version)` unique.

### Update Flow

```
### API
```

POST /api/assets/:id/versions
Content-Type: multipart/form-data
file: <binary>
changelog?: string
Response: 201
{ "version": 3, "id": "new-version-uuid" }

GET /api/assets/:id/versions
Response: 200
[
{ "version": 1, "created_at": "...", "changelog": "Initial upload" },
{ "version": 2, "created_at": "...", "changelog": "Updated face" },
{ "version": 3, "created_at": "...", "changelog": "Added hat" }
]

GET /api/assets/:id/versions/:version
Response: 200
{ ...version metadata... }

```
### UI

In the gallery preview modal, a version selector shows "v3 of 3" with
previous/next buttons. Each version shows its changelog and timestamp.
The current version is marked with a green dot.

---

## Migration from Gallery

Old gallery items map to assets as follows:

1. **Old item**: `GalleryItem { chat_id, character_id, url, type, caption }`
2. **New asset**: Extract filename from `url`, detect MIME from `type`, set `storage_path = url`
3. **New link**: Create `asset_link` with `asset_id` from step 2, `entity_type` from old item's context (chat or character), `entity_id` from old `chat_id`/`character_id`, `label = old caption`

This is a one-time migration script, not needed for fresh installs.
```
