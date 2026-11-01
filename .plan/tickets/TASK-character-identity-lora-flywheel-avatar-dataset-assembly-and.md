<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Character-identity LoRA flywheel: avatar dataset assembly and auto-apply

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-training-finetune-datasets
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

## Context

Slice under the existing epic-training-finetune-datasets.md (its ticket section was TBD). Nothing connects training back to the *character*: the closed loop generate avatars -> dataset -> train -> auto-register -> auto-apply per character is unowned. The emotion-avatar system already records emotion/outfit/seed provenance (`src/characters/services/emotion-avatar-service/job-records.ts:19-26`); inference-side LoRA application is fully built (`ImageGenOptions.lora` `src/generation/image-engine/types.ts:23-24`; discovery cache `src/generation/lora/discovery.ts:40-72`). Coverage: train/finetune hits cover export/providers/sidecar/registry-import but mention neither `character_avatars`/`selection_rule` wiring nor emotion-balanced assembly; 9dca720 covers only the Replicate adapter; b83e4f4 only generic artifact import.

Related: epic-training-finetune-datasets.md, epic-lora-discovery-application.md (Done). DEPENDS ON TASK-generation-fact-capture-at-queue-time (31df5ce) for caption provenance (B2).

## Summary

For one character, build the ai-toolkit-format dataset (images + captions) from `asset_links(entity_type=character)` (`src/db/schema-content.ts:17-25`) union `character_avatars` (`src/db/schema-character.ts:89-92`), balanced across emotion x outfit slots using `generation_jobs` payloads; captions via caption route with prompt-reconstruction from job payload + emotion modifier as fallback; dedup by `assets.content_hash`; emit manifest with asset_ids, slot labels, seed provenance, license fields. Then auto-wire a trained LoRA to `character_avatar_config.selection_rule` and default application in generation.

## Acceptance Criteria

- [ ] Every emotion slot represented >= N images or the build fails loudly with the shortfall.
- [ ] Captions present for 100% of images (captioner or reconstructed prompt, source labeled).
- [ ] Manifest carries asset_id -> file -> caption provenance and content-hash dedup report.
- [ ] E2E/hidden/moderation-flagged assets excluded.
- [ ] Tests with in-memory DB fixtures.
- [ ] Trained character LoRA auto-registers and is default-applied for that character per selection_rule.

## Caveats

- [ ] Dependency ordering: captions degrade to vision-LLM output until 31df5ce lands (B2).
- [ ] Small/biased sets: naive LoRA memorizes base pose — per-slot seeds + balance checks mandatory.
- [ ] Privacy: NSFW content stays on-host (local ai-toolkit lane via 6f1a058 sidecar).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
