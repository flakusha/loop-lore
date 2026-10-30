<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Emotion Avatar Regeneration Control

**Overview:** (see sections below)


**Status:** In Progress
**Status Note:** durable jobs, emotions-subset, outfit-scoped replace + single-slot re-roll shipped; dedicated actor-level regenerate route and seed capture shipped; per-avatar UI re-roll shipped (regenerate all / selected / per-variant, seed pin + reuse). Remaining scope decomposed 2026-10-30; tickets scoped to worktree feat-emotion-avatar-completion
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

Batch generation exists (`POST /actors/:actorId/emotion-avatars` →
`startBatchGeneration`), and the regeneration control surface is partially
landed (verified 2026-10-09):

- Single-slot re-roll exists **under wardrobe scope**
  (`POST /actors/:actorId/wardrobe/:itemId/emotion-avatars/single`, replace
  default true) and batch accepts an `emotions` subset — but there is still no
  actor-level regenerate route for avatars outside any outfit.
- Job state is mirrored to the `generation_jobs` table (`job-records.ts`) so
  list/status survive restart; restart reconciliation of orphaned `running`
  jobs is still open.
- Replace-vs-duplicate is settled: `replace` deletes prior variants for the
  same (emotion, outfit scope) only — outfit-scoped regen isolation.


## Current State (verified 2026-10-09)

- `src/characters/services/emotion-avatar-service/` — batch generation with
  `emotions` subset filter, per-slot results, `replace` semantics, and a
  single-slot path (`single-generation.ts`) with outfit descriptor + auto
  matting.
- `src/characters/services/emotion-avatar-service/job-store.ts` — in-memory
  live store; `job-records.ts` mirrors jobs into the `generation_jobs` table
  (status/results persist across restart; no orphan reconciliation yet).
- `src/routes/character-emotion-avatars.ts` — batch `POST .../emotion-avatars`
  (emotions validated/capped/deduped), job list + status + SSE stream +
  cancel.
- `src/routes/wardrobe-avatars.ts` — outfit-scoped batch + single-slot
  generation (single defaults to replace; sibling slots untouched) +
  outfit/avatar resolution endpoint.
- Defects fixed along the way: job-route authz, single-generation rate-limit
  policy, uncapped `emotions` fan-out (tickets below).

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
      subset filter over batch, per-slot result reporting (satisfied via the
      regenerate endpoint delegating to `startBatchGeneration` with a slot
      filter — no duplicated service method)
- [x] Routes: regenerate endpoint + job status GETs; validation schema in
      `src/validation/schemas/` (endpoint: `POST /actors/:actorId/emotion-avatars/regenerate`;
      job status GETs/SSE/cancel reuse the existing batch job routes;
      schema: `src/validation/schemas/emotion-avatars.ts`);
      outfit-scoped batch/single generation with ownership-checked wardrobe item params
- [ ] Slot-replace semantics: re-point binding, cleanup old asset,
      transactional, (emotion, outfit)-scoped isolation
- [ ] Persistent job store (migration + regen schema artifacts) with
      in-memory cache; restart reconciliation for orphaned jobs
      → [`TASK-emotion-avatar-job-restart-reconciliation.md`](../tickets/TASK-emotion-avatar-job-restart-reconciliation.md)
- [x] Seed capture/override per generation — one base seed per batch
      (`seed.ts`), slot seeds derived as `base + EMOTION_ORDINAL[emotion]`, the
      base seed persisted with the job (`generation_jobs.payload.seed`) and
      readable back per actor/outfit scope; callers pin a seed or ask to reuse
      the recorded one (`seedStrategy: "reuse"`)
      → `TASK-generation-seed-capture-and-override-per-avatar`
- [x] UI: per-avatar "re-roll" button on emotion grid + "regenerate all" +
      subset picker + job progress (SSE)
      → `TASK-regen-ui-re-roll-and-regenerate-all-controls`
- [ ] Tests: subset regen, replace-atomicity (old variant never unbound-mid-
      flight), restart-durable job status, route authz (actor + wardrobe-item
      ownership)
      → [`TASK-emotion-avatar-regen-atomicity-and-subset-regression-tests.md`](../tickets/TASK-emotion-avatar-regen-atomicity-and-subset-regression-tests.md)

- `TASK-reroll-emotion-command.md` — /reroll-emotion in-chat command wrapping emotion-avatar regenerate (open, 2026-10-23 attachment batch)

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
- [`BUG-bug-emotion-avatar-job-routes-authorize-only-the-path-actor-.md`](../tickets/BUG-bug-emotion-avatar-job-routes-authorize-only-the-path-actor-.md)
  — job-route authz (done)
- [`BUG-rate-limit-misses-post-emotion-avatars-single.md`](../tickets/BUG-rate-limit-misses-post-emotion-avatars-single.md)
  — single-slot generation rate policy (done)
- [`BUG-emotion-avatar-emotions-array-uncapped-x-default-rate-policy.md`](../tickets/BUG-emotion-avatar-emotions-array-uncapped-x-default-rate-policy.md)
  — `emotions` subset cap on the batch route (done)
