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

1. UUID is generated for the asset (e.g., `abcd1234-...`)
2. First 2 chars of UUID become a subdirectory (`ab/cd/`)
3. Raw file placed at `data/assets/raw/ab/cd/abcd1234.{ext}`
4. Compressed variants at `data/assets/compressed/ab/cd/abcd1234.webp`
5. Thumbnail at `data/assets/compressed/ab/cd/abcd1234_thumb.webp`
6. Audio files at `data/assets/audio/ab/cd/abcd1234.opus`
7. Video files at `data/assets/video/ab/cd/abcd1234.webm`

Path scheme: first 2 chars of UUID as subdirectory to avoid inode limits.

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

| Asset | Links To | Label | Purpose |
|-------|----------|-------|---------|
| `portrait.webp` | `character` uuid | `portrait` | Character portrait |
| `bgm.opus` | `world` uuid | `ambient` | Background music |
| `screenshot.png` | `chat` uuid | `scene` | Scene illustration |
| `avatar.jpg` | `user` uuid | `avatar` | User profile picture |

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

## Migration from Gallery

Old gallery items map to assets as follows:

1. **Old item**: `GalleryItem { chat_id, character_id, url, type, caption }`
2. **New asset**: Extract filename from `url`, detect MIME from `type`, set `storage_path = url`
3. **New link**: Create `asset_link` with `asset_id` from step 2, `entity_type` from old item's context (chat or character), `entity_id` from old `chat_id`/`character_id`, `label = old caption`

This is a one-time migration script, not needed for fresh installs.
