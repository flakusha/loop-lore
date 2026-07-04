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

```
data/assets/
  raw/                  Original uploads
    ab/cd/abcd1234.jpg   Path derived from asset UUID
  compressed/           Pre-compressed variants
    ab/cd/abcd1234.webp  WebP version
    ab/cd/abcd1234_thumb.webp  256px thumbnail
  audio/                Audio files (stored as-is or transcoded)
    ab/cd/abcd1234.opus
  video/                Video files
    ab/cd/abcd1234.webm
```

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

## Upload & Processing Pipeline

```
1. User uploads file via POST /api/assets
2. Server validates: size, type, mime
3. Server generates UUID, stores raw file
4. Background processing (async):
   - Images: generate WebP compressed + thumbnail
   - Audio: optionally transcode to Opus
   - Video: optionally generate poster frame
5. Asset record written to DB
6. Response returned with asset ID + URLs
```

### Compression Strategy

| Asset Type | Compressed Variants               |
| ---------- | --------------------------------- |
| Image      | WebP (q=85), thumbnail 256px WebP |
| Audio      | Opus 96kbps (if not already)      |
| Video      | Poster frame JPEG, thumbnail      |

## Asset Linking (Polymorphic)

Assets are not directly tied to a single entity. Instead, `asset_links` junction table maps assets to any entity:

```
Asset "portrait.webp" → link { entity_type: 'character', entity_id: 'char-uuid', label: 'portrait' }
Asset "bgm.opus"     → link { entity_type: 'world', entity_id: 'world-uuid', label: 'ambient' }
Asset "screenshot.png" → link { entity_type: 'chat', entity_id: 'chat-uuid', label: 'scene' }
Asset "avatar.jpg"   → link { entity_type: 'user', entity_id: 'user-uuid', label: 'avatar' }
```

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

```
GalleryItem { chat_id, character_id, url, type, caption }
→ Asset { filename: extract from url, mime: detect, storage_path: url }
→ asset_link { asset_id, entity_type: old type, entity_id: old chat/char id, label: old caption }
```

This is a one-time migration script, not needed for fresh installs.
