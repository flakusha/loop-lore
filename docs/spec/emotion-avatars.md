<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Emotion Avatars

**Status:** WIP
**Type:** Feature Spec
**Dependencies:** character-spec.md, assets.md, assistant-commands.md

---

## Overview

Emotion avatars generate a per-actor image for a target emotion, so a character
can present distinct visuals (angry, happy, surprised, …) without manually
curating art for every mood. Generation is delegated to a configured image
provider; when live generation is unavailable, a metadata-extraction fallback
builds a prompt from a base avatar so a usable image is still produced.

## 1. Implementation Layout

| Path | Responsibility |
| ---- | -------------- |
| `src/characters/services/emotion-avatar-service/index.ts` | `EmotionAvatarService` public API |
| `src/characters/services/emotion-avatar-service/generation.ts` | Batch + single generation dispatch |
| `src/characters/services/emotion-avatar-service/emotions.ts` | Emotion → prompt-modifier mapping |
| `src/characters/services/emotion-avatar-service/job-store.ts` | Job state persistence |
| `src/characters/services/emotion-avatar-service/types.ts` | `BatchJobId`, `GenerateEmotionAvatarsOpts`, `BatchGenerationJob`, … |
| `src/characters/services/emotion-avatar-fallback.ts` | Metadata extraction + fallback prompt |
| `src/assistant/prompt/sections/emotion-avatar.ts` | Assistant prompt section injection |

## 2. Service API

`EmotionAvatarService` exposes:

```typescript
startBatchGeneration(opts: GenerateEmotionAvatarsOpts): Promise<BatchJobId>
generateEmotionAvatar(opts: {
  actorId: string;
  emotion: EmotionType;
  sdConfig: ImageProviderConfig;
  uploadDir: string;
  promptPrefix?: string;
  negativePrompt?: string;
  baseAvatarId?: string;
  fallbackMode?: "generation" | "none";
  avatarEmotions?: Record<string, EmotionEntry>;
}): Promise<{ avatarId: string; assetId: string }>
getJobStatus(jobId: BatchJobId): BatchGenerationJob | undefined
cancelJob(jobId: BatchJobId): boolean
listJobs(actorId: string): BatchGenerationJob[]
getEmotionPromptModifier(emotion: EmotionType): string
resolveEmotionPromptModifier(emotion: EmotionType, avatarEmotions?: Record<string, EmotionEntry>): string
```

## 3. Generation Flow

`generation.ts` (`runBatchGeneration` / `generateEmotionAvatar`) drives the image
provider identified by the `sdConfig: ImageProviderConfig` option, then persists
the result through the asset service (`src/assets/service`). Two relevant inputs:

- `baseAvatarId` — an existing avatar used as the visual anchor.
- `fallbackMode: "generation" | "none"` — when generation fails:
  - `"generation"` → extract metadata from the base avatar and build a fallback
    prompt (see §4).
  - `"none"` → no image is produced on failure.

Jobs are tracked via `job-store.ts` so status (`getJobStatus` / `cancelJob` /
`listJobs`) is observable from the caller.

## 4. Emotion Model & Fallback

`emotions.ts` maps an `EmotionType` to a prompt modifier via
`getEmotionPromptModifier`, and `resolveEmotionPromptModifier` merges any
per-avatar `EmotionEntry` records over the default mapping.

`emotion-avatar-fallback.ts` backs the `"generation"` fallback:

- `extractAvatarMetadata(db, assetId, opts?)` reads embedded metadata from an
  existing avatar asset (`AvatarMetadata`).
- `buildEmotionPrompt(metadata, emotion, emotionModifier, qualityTags?)` composes
  a generation prompt from that metadata plus the resolved emotion modifier.

## 5. Prompt Integration

The assistant prompt section `emotionAvatarSection`
(`src/assistant/prompt/sections/emotion-avatar.ts`) injects the current emotion
avatar context into the assistant prompt so generation stays consistent with the
active visual state.

## 6. Current State

- Substantial: service, generation dispatch, emotion mapping, job store, and a
  metadata-extraction fallback all exist and are tested.
- Provider surface is a single configured image provider (`ImageProviderConfig`);
  multi-provider fan-out is not yet implemented in code.
- No dedicated UI document yet — see `frontend/characters.md` for the character
  surface that hosts avatars.
