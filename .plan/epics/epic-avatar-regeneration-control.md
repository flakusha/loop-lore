<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Emotion Avatar Regeneration Control

**Status:** 🔴 Not Started
**Priority:** Medium
**Effort:** Small
**Type:** Feature Epic
**Tags:** avatar, emotion, regeneration, jobs

## Summary

Give operators/players control over re-rolling emotion avatars: regenerate the
**entire batch** (all emotion slots), a **subset** of slots, or a **single**
emotion avatar — replacing the existing variant for that slot atomically, with
durable job status.

## Motivation

Today batch generation exists (`POST /actors/:actorId/emotion-avatars` →
`runBatchGeneration`) but regeneration does not:

- No route to re-roll **one** emotion (e.g. `angry` came out malformed) without
  re-rolling the whole set — wasting provider spend and discarding good
  variants.
- Job state lives in an in-memory store (`job-store.ts` `Map`) — cancel/list
  survive only the process; a restart orphans in-flight batches and clients
  polling `jobs/:jobId`.
- No replace-vs-duplicate policy for a slot that already has an avatar.

## Current State

- `src/characters/services/emotion-avatar-service/generation.ts` —
  `runBatchGeneration` (whole set) + `generateEmotionAvatar` (single, internal,
  un-routed).
- `src/characters/services/emotion-avatar-service/job-store.ts` — in-memory
  `createJob/getJob/listJobs/cancelJob`.
- `src/routes/character-emotion-avatars.ts` — `POST .../emotion-avatars`
  (batch), `POST .../jobs/:jobId/cancel`. No regenerate/delete-by-emotion.

## Architecture

- **Route surface:**
  - `POST /actors/:actorId/emotion-avatars/regenerate` — body
    `{ emotions?: EmotionType[], seedStrategy?, replace: "slot" | "append" }`;
    omitted `emotions` = full batch. Delegates to `runBatchGeneration` with a
    slot filter.
  - `GET /actors/:actorId/emotion-avatars/jobs` + `GET .../jobs/:jobId` —
    status polling (done/failed/skipped per slot).
- **Slot replacement:** regenerate writes the new asset, re-points the
  emotion→avatar binding, then schedules old-asset cleanup (keep last-N for
  undo if cheap; otherwise hard delete after commit).
- **Durable jobs:** promote `BatchGenerationJob` to a DB table (or reuse the
  `generation_attempts`/aux-job pattern) so status survives restart; in-memory
  store becomes a cache.
- **Seed discipline:** regeneration accepts explicit seed or records the seed
  used, so "same prompt, re-roll" is reproducible-when-wanted.

## Work Items

- [ ] Service: `regenerateEmotionAvatars(actorId, { emotions?, replace })` —
      subset filter over batch, per-slot result reporting
- [ ] Routes: regenerate endpoint + job status GETs; validation schema in
      `src/validation/schemas/`
- [ ] Slot-replace semantics: re-point binding, cleanup old asset, transactional
- [ ] Persistent job store (migration + regen schema artifacts) with
      in-memory cache; restart reconciliation for orphaned jobs
- [ ] Seed capture/override per generation
- [ ] UI: per-avatar "re-roll" button on emotion grid + "regenerate all" +
      subset picker + job progress
- [ ] Tests: subset regen, replace-atomicity (old variant never unbound-mid-
      flight), restart-durable job status, route authz (actor ownership)

## Non-Goals

- Prompt editing UX for emotion descriptors (lives in emotion definitions CRUD,
  `TASK-character-emotion-definitions-crud-ui`) — regen here re-rolls with the
  current config; combined flows come later.
- Cost budgeting/rate policy beyond existing aux-pipeline limits.

## Acceptance Criteria

- Single emotion re-rolls without touching sibling slots
- Full-batch and subset regeneration both report per-slot status
- Job progress survives a server restart
- Failed re-roll keeps the previous variant bound (no avatar-less window)

## Related

- `epic-emotion-avatar-message-binding.md` — consumes emotion→avatar bindings
  this epic replaces
- `TASK-aux-emotion-avatar.md` / `TASK-aux-llm-emotion-classifier.md` —
  detection side of the pipeline
- `epic-asset-transform-metadata.md` — regenerated avatars inherit/recompute
  crop metadata (see its re-bake rule)
- `epic-wardrobe-avatar-variants.md` — regen must become variant-scoped once
  wardrobe dimension exists
- `epic-asset-platform-capabilities.md` — B3 GC owns the delete-and-replace
  churn; B1 dedup absorbs re-roll byte cost
