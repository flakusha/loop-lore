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
| `src/characters/services/emotion-avatar-service/job-events.ts` | In-process per-job progress pub/sub |
| `src/routes/character-emotion-avatars-stream.ts` | SSE stream for per-variant job progress |
| `src/characters/services/emotion-avatar-service/types.ts` | `BatchJobId`, `GenerateEmotionAvatarsOpts`, `BatchGenerationJob`, … |
| `src/characters/services/emotion-avatar-service/seed.ts` | Base/slot seed derivation (see §8) |
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

## 7. Progress Streaming (SSE) & Job-Store Volatility

### SSE progress stream

`GET /api/v1/actors/:actorId/emotion-avatars/jobs/:jobId/stream` streams
per-variant progress for a batch job as `text/event-stream`. Authorization is
identical to the other job endpoints (`requireUserId` +
`checkActorOwnership`); the job must also belong to the `:actorId` in the path,
otherwise the endpoint answers 404. No new auth surface is introduced.

Event protocol:

- `event: progress` — JSON payload `{ jobId, done, total, status }`. An initial
  snapshot is sent immediately on connect; this is the reconnect/stale-job
  guard, so a client that reconnects — or connects to a job that already
  finished — learns the current state without waiting for the next variant.
- `event: progress` — re-sent after every variant settles and once more when the
  job reaches a terminal status (`completed` / `failed` / `cancelled`).
- `event: done` — sent on terminal status; the stream then closes.
- `: keepalive` — comment ping every 15s while the job is still running.

Progress is derived in-process (`job-events.ts`): `done` counts results with
status `completed` or `failed`, `total` is the number of requested variants.

### Polling fallback

`GET /jobs/:jobId` polling remains the fallback for clients that cannot hold an
SSE connection. The frontend (`actor-emotion-avatars.ts`) opens an
`EventSource` per active job and keeps the 2s polling loop as a safety net;
streams close on terminal status and on actor switch, and late events after an
actor switch are ignored.

### Job-store volatility

Jobs live in an in-memory store (`job-store.ts`) and survive only as long as the
server process. A restart loses every job: stream clients receive a 404 and
polling clients see the job disappear. There is no persistence or replay — after
a restart, clients must re-poll (and re-create) jobs rather than expect the old
job IDs to resolve.

## 8. Seed Discipline

Every generation carries an explicit seed, so a run is reproducible and a later
run can reproduce an earlier image.

### Base seed & slot seeds

- **Base seed** — the seed a batch runs under. It is resolved in this order:
  1. the seed the caller supplied (`GenerateEmotionAvatarsOpts.seed`);
  2. the seed recorded for the scope, when the caller asked to `reuse` it;
  3. a fresh random base seed.
- **Slot seeds** — one seed per emotion variant, derived from the base seed:
  `slotSeed = baseSeed + EMOTION_ORDINAL[emotion]`. The ordinal is a stable
  per-emotion offset, so a variant keeps its identity across runs and a
  single-slot re-roll reproduces that slot alone.
- **Range** — a base seed is an integer in `[0, 2_147_483_647 - maxOrdinal]`, so
  `base + ordinal` stays inside the signed 32-bit range the providers expect. A
  seed outside that range is rejected with 400: the actor-level batch endpoint
  checks it up front, the other endpoints let the service reject it.

`seed.ts` owns the derivation (`randomBaseSeed`, `slotSeed`, `isValidSeed`).

### Persistence

The base seed is stored in the job record's JSON payload (`generation_jobs.payload`,
key `seed`) and the slot seeds in the job's result entries (key `seed`).
`findRecordedBaseSeed` reads the newest matching record back, scoped by actor
and by outfit when the run is outfit-scoped, so one actor's or outfit's seed
never leaks into another's.

### Overriding a run

- `POST /api/actors/:actorId/emotion-avatars/regenerate` accepts `seed` (an
  integer) and `seedStrategy`.
- `seedStrategy: "reuse"` re-runs the batch under the recorded seed of the
  scope verbatim — the reproduction case. Any other strategy (including
  `"random"`) draws a fresh random base seed.
- The actor-level batch endpoint accepts an explicit `seed` and a `seedStrategy`
  as well; the wardrobe generation endpoints accept an explicit `seed`.

### Provider caveat

The seed reaches the provider as its `seed` option. The `sdcpp` and `comfyui`
engines forward it; the `openai` and `sdapi` engines ignore it and let the
provider choose the noise. With those engines the recorded seed still pins the
run's seed value, but it does not reproduce the same image.

## 9. Panel UI

The character edit page's "Sub-resources" section carries the emotion-avatar
panel (`src/components/character/emotion-avatars-panel.html`, driven by the
`actorEmotionAvatarsFactory` Alpine plugin). It exposes:

- **Base avatar id** — the avatar the variants derive from.
- **Emotion picker** — every emotion type (`EmotionType`), not a hard-coded
  subset. The selection is the batch subset and the scope of "Regenerate
  selected"; an empty selection cannot start a run.
- **Prompt prefix / negative prompt** — optional prompt fragments.
- **Base seed** — an optional explicit base seed plus a "reuse the seed
  recorded for this actor" toggle. Reuse wins over the seed field (the field
  is disabled while reuse is on): reuse reproduces the recorded run, an explicit
  seed pins a new one, neither draws a random base.
- **Start batch generation** — a fresh batch; its variants are appended.
- **Regenerate all** — re-rolls every base (outfitless) emotion slot
  (`replace: "slot"`): the emotion→avatar binding is re-pointed and the old
  asset is cleaned up.
- **Regenerate selected** — the same, restricted to the picked emotions.
- **Current emotion avatars** — the actor's base emotion variants with a
  per-variant "Re-roll" button (one emotion, `replace: "slot"`).

Outfit-scoped slots are not re-rollable from this panel: they belong to the
wardrobe panel (`POST /actors/:actorId/wardrobe/:itemId/emotion-avatars/single`).

Every run reports progress in the panel's job table (SSE stream, polling
fallback), and the variant grid reloads when a job reaches a terminal state.

An empty `emotions` list means "no subset" everywhere: the service falls back
to the default emotion set instead of running a zero-slot batch that would
report `completed` without producing an avatar.

