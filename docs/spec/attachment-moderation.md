# Attachment Moderation Specification

**Status:** Draft
**Date:** 2026-07-28
**Authoritative source:** `src/` and `AGENTS.md`

---

## Overview

Defines the content analysis, moderation review queue, and auto-caption pipeline for attachments uploaded in chat. Complements the `docs/spec/assets.md` pipeline (upload → store → compress) with a missing **step 4b: content analysis**.

---

## 1. Content Analysis Pipeline (Step 4b)

Extends the assets upload pipeline in `docs/spec/assets.md` between step 4 (compression) and step 5 (DB write).

### Steps

| Step | Action               | Details                                                                                                             |
| ---- | -------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 4b.1 | **Auto-caption**     | Run image through vision model to generate descriptive caption; store as `asset.caption`                            |
| 4b.2 | **Image moderation** | Run `ImageModerationHook` on uploaded images (NSFW, violence, PII detection)                                        |
| 4b.3 | **Review flag**      | If moderation hook flags content, set `asset.moderation_status = 'flagged'` and create a `moderation_review` record |
| 4b.4 | **Auto-approve**     | If content passes moderation and caption is generated, set `asset.moderation_status = 'approved'`                   |
| 4b.5 | **DB write**         | Insert asset record with all metadata including `moderation_status` and `caption`                                   |

### Moderation Status Enum

```typescript
enum ModerationStatus {
  pending = 'pending'     // Awaiting review (auto-flagged)
  approved = 'approved'   // Passed moderation
  rejected = 'rejected'   // Failed moderation — asset not served
  under_review = 'under_review'  // In admin review queue
}
```

## 2. Image Moderation Hook

### Purpose

Text-only NSFW and moderation hooks exist (`nsfw-hook.ts`, `moderation-hook.ts`). The image moderation hook applies the same policy to visual content.

### Policy Checks

| Check                                      | Severity | Action                                                |
| ------------------------------------------ | -------- | ----------------------------------------------------- |
| NSFW content (nudity, sexual explicitness) | High     | Flag for review, block by default unless NSFW allowed |
| Violence / gore                            | Medium   | Flag for review                                       |
| PII detection (faces, documents)           | Medium   | Flag for review                                       |
| Offensive symbols / hate symbols           | High     | Reject outright                                       |

### Configuration

Moderation hooks are configured per chat/world, not globally:

```typescript
interface ModerationConfig {
  enabled: boolean;
  nsfw_policy: "allow" | "flag" | "block";
  violence_policy: "allow" | "flag" | "block";
  pii_policy: "allow" | "flag" | "block";
  auto_approve_safe: boolean; // auto-approve content that passes all checks
}
```

## 3. Review Queue

### Overview

Flagged or rejected assets are placed in a moderation review queue accessible to admins and GMs.

### Data Model

```typescript
interface ModerationReview {
  id: string;
  asset_id: string;
  reason: moderation_violation_type;
  flagged_by: "automoderation" | "manual_flag";
  status: "pending" | "approved" | "rejected";
  reviewed_by?: actor_id;
  reviewed_at?: timestamp;
  notes?: string;
  created_at: timestamp;
}
```

### API Endpoints

| Method | Path                                  | Description                                          |
| ------ | ------------------------------------- | ---------------------------------------------------- |
| GET    | `/api/moderation/reviews`             | List pending reviews (admin/GM only)                 |
| GET    | `/api/moderation/reviews/:id`         | Get review details                                   |
| POST   | `/api/moderation/reviews/:id/approve` | Approve flagged asset                                |
| POST   | `/api/moderation/reviews/:id/reject`  | Reject flagged asset (asset is removed from serving) |
| GET    | `/api/moderation/queue/count`         | Count of pending reviews                             |

### Admin UI

A moderation dashboard showing:

- Pending reviews with thumbnail preview
- Moderation decision (approve/reject/flag again)
- Notes field for admin comments
- Filter by severity, type, and requester

## 4. Auto-Caption Configuration

### Default Behavior

Auto-caption is enabled by default for all chats but can be overridden per chat or world:

```typescript
interface CaptionConfig {
  enabled: boolean;
  model: string; // vision model identifier
  max_caption_length: number; // default 200 chars
  include_alt_text: boolean; // also generate alt_text for accessibility
  policy: "always" | "on_upload" | "manual_only";
}
```

### Per-Chat Override

Chats can set a different caption policy in their settings:

```typescript
interface ChatCaptionPolicy {
  chat_id: string;
  caption_enabled: boolean;
  auto_caption: boolean;
  caption_model?: string; // override global default
}
```

## 5. Metadata Extraction Extensions

Beyond the existing `metadata.ts` (PNG/JPEG/WebP/GIF header parsing), extend with:

| Extension           | Details                                             |
| ------------------- | --------------------------------------------------- |
| EXIF extraction     | GPS coordinates, camera model, timestamps           |
| Image hashing       | Perceptual hash (pHash) for deduplication detection |
| Duration extraction | For video/audio assets                              |
| ICC profile         | Color profile for color-sensitive rendering         |

## 6. Thumbnail Generation

### Current Gap

`docs/spec/assets.md` line 86 defines "256px thumbnail WebP" as a processing step, but no code generates thumbnails. The `AssetRecord` has `width`/`height` but no `thumbnail_path` field.

## 7. Spec ↔ Code Alignment

| Concern              | Spec         | Code                               | Gap                            |
| -------------------- | ------------ | ---------------------------------- | ------------------------------ |
| Content analysis     | ✅ This spec | ⚠️ `/caption` exists (manual only)  | **No pipeline integration**    |
| Image moderation     | ✅ This spec | ❌ None                            | **No image analysis**          |
| Review queue         | ✅ This spec | ❌ None                            | **Entirely missing**           |
| Auto-caption         | ✅ This spec | ⚠️ Manual `/caption`                | **No automation**              |
| Thumbnail generation | ✅ This spec | ❌ No code                         | **Missing implementation**     |
| Metadata extensions  | ✅ This spec | ⚠️ Limited (PNG/JPEG/WebP/GIF only) | **No EXIF, hashing, duration** |

## Cross-References

- `docs/spec/assets.md` — upstream upload and compression pipeline (this spec extends step 4)
- `docs/spec/chat-privacy.md` — chat privacy controls that interact with moderation policy
- `src/generation/hooks/` — hook infrastructure that supports new `ImageModerationHook`
- `.plan/epics/epic-chat-lifecycle-moderation.md` — chat lifecycle epic that this feeds into
