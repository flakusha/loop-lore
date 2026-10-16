<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Reference-Set Consistency Signal (alt_text Comparison)

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-reference-conditioned-generation
**Related:** `TASK-reference-set-entity.md`, `TASK-reference-set-multi-image-upload.md`, `TASK-illustrated-book-reference-pass.md`, `src/db/schema-content.ts`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

Add the cheap consistency pre-filter for reference sets: compare the VLM
captions already stored on `assets.alt_text` across a set (or against a
declared subject description) and flag drift before a candidate image enters
the set. Phase 0 of `epic-reference-conditioned-generation` (bound via the
**Epic:** header).

## Context

**Why alt_text.** `assets.alt_text` (`src/db/schema-content.ts:49`) holds VLM
captions — today the only machine-readable description of what an asset
actually shows. Character identity across a reference set shows up as caption
agreement: the same hair, outfit, and silhouette described the same way. This
is the consistency signal that already exists in the schema; nothing reads it
this way yet.

**Where it plugs in.** The illustrated-book pass builds its reference set per
publication from accepted illustrations, nearest-first, pinned always in,
rejected never (`TASK-illustrated-book-reference-pass.md:53-56,66-70`). The
check runs at selection time: a candidate whose caption drifts from the set is
flagged before it is linked. `TASK-reference-set-entity.md` provides the
persisted set + items this reads; the epic's Phase 0 request model defines the
positions.

**Honest ceiling.** Caption comparison catches gross drift — wrong character,
wrong outfit color, wrong species — not subtle likeness. The real consistency
mechanism is reference-conditioned generation itself; this is a pre-filter that
keeps an obviously-wrong image out of the set, not a face-recognition system.
No training, no fine-tuning, no benchmarking harness.

**Missing data is a verdict, not a pass.** An asset without a caption gets an
explicit "unknown" verdict; the caller decides (pin still forces inclusion),
but the signal never silently degrades to "consistent".

## Acceptance Criteria

- [ ] A pure function takes ordered reference-set items with `alt_text` (+ an
      optional declared subject description) and returns a per-item drift
      verdict with reasons
- [ ] Missing/empty `alt_text` yields an explicit "unknown" verdict, never a
      silent pass
- [ ] Wired as a pre-filter in the reference-set builder; the verdict is
      recorded on the set item or the selection log, not just returned
- [ ] Pinned items bypass the pre-filter by rule (pin = always included) but
      still record their verdict
- [ ] Unit tests cover: agreement, gross drift, missing caption, empty set
- [ ] No model call, no training, no benchmark harness; pure caption-text
      comparison only
