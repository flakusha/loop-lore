<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Generation seed capture and override per avatar

**Summary:** Every emotion-avatar batch now runs under one explicit base seed, records it with the job, and can be re-run under a pinned or reused seed.
**Context:** `src/characters/services/emotion-avatar-service/seed.ts` (base/slot derivation), `generation.ts` (`resolveBaseSeed`), `job-records.ts` (`findRecordedBaseSeed`, `payload.seed`), `single-generation.ts` (seed handed to the provider), the actor-level + regenerate + wardrobe routes (`seed`, `seedStrategy`).
**Acceptance Criteria:** One base seed per batch; slot seeds derived from it; the base seed persisted with the job and readable back per scope; callers can pin or reuse a seed; an out-of-range seed rejected; spec + changelog updated.

**Status:** Done
**Scope:** epic-avatar-regeneration-control: seed capture/override per emotion avatar
**Priority:** low
**Effort:** Medium
**Epic:** epic-avatar-regeneration-control

## Summary

Seed recorded at generation, reusable on re-roll. Part of epic Emotion Avatar Regeneration Control.


## Design

One batch runs under ONE base seed; every emotion slot derives its provider
seed from it as `base + EMOTION_ORDINAL[emotion]` — a stable per-emotion
offset, so a variant keeps its identity across runs and a single-slot re-roll
reproduces that slot alone.

The base seed is resolved in this order:

1. the seed the caller supplied;
2. the seed recorded for the scope, when the caller asked to `reuse` it;
3. a fresh random base seed.

The base seed is persisted in the job record's JSON payload
(`generation_jobs.payload.seed`) and the slot seeds in the job's result
entries. `findRecordedBaseSeed` reads the newest matching record back, scoped
by actor and by outfit, so one actor's or outfit's seed never leaks into
another's.

Storage rides on the existing free-form JSON columns — no migration.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
- [x] One base seed per batch; slot seeds derived as `base + EMOTION_ORDINAL`
- [x] Base seed persisted with the job and readable back per actor/outfit scope
- [x] `seed` accepted by the actor-level batch, regenerate and wardrobe endpoints
- [x] `seedStrategy: "reuse"` re-runs the batch under the recorded seed
- [x] An out-of-range seed is rejected (400), not forwarded to the provider
- [x] Spec section (`docs/spec/emotion-avatars.md` §8) + changelog entry


**Resolved:** 2026-10-22 registry-driven close: git issue 62f51fd (registry tip: 1a4da294d Konstantin Fedotov Auto-closed: appended .md marker marks TASK-GENERATION-SEED-CAPTURE-AND)

## Verification

- Unit: `bun test --isolate src/characters/services/emotion-avatar-service/
  src/routes/character-emotion-avatars.test.ts
  src/routes/character-emotion-avatars-regenerate.test.ts
  src/routes/wardrobe-avatars.test.ts` — green.
- Coverage of the new behaviour: the pinned-base-seed run (provider seed per
  slot + the recorded payload/result seeds), the `reuse` strategy against a
  recorded seed, the recorded-seed lookup per scope (outfit-scoped records do
  not leak into the outfitless lookup, seedless records are skipped), the
  provider receiving the slot seed, the route-level seed delegation and the
  range rejection.
- Lint/format: `bunx eslint` + `bunx dprint check` clean on the touched files.
