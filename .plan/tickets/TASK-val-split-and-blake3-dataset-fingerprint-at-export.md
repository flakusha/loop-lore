<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Val split and BLAKE3 dataset fingerprint at export

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-finetune-eval-promotion-gate
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

## Context

First ticket of epic-finetune-eval-promotion-gate.md. Every ticketed training lane ends at "artifact exists": c0def4e stores training metrics (loss), 3f57ed6 compare-vs-base lives in Together console, and the only eval epic (epic-rag-evaluation-observability, 9ef32dd) is retrieval-scoped. Nothing owns carving a validation split at export time or a reproducible dataset identity consumed by job records. Coverage: `giwt search eval` -> no fine-tune/promotion owner; `search finetune` -> none eval.

## Summary

Extend the dataset-export module (issue 64d38ce) to: carve a 10-20% holdout keyed by `chat_id` hash (keeps conversation leakage out of train); compute a BLAKE3 dataset fingerprint (reuse `src/native/blake3.ts`) over train+val bytes; write both into the export manifest consumed by TrainingProvider job records (c0def4e).

## Acceptance Criteria

- [ ] Split is deterministic for a given dataset version and leaks no `chat_id` across splits.
- [ ] Fingerprint reproducible byte-for-byte.
- [ ] Manifest fields (`val_split`, `fingerprint`, row counts, filters applied) present on every export and stored on the job record.
- [ ] Unit tests pin all three.

## Caveats

- [ ] Partial failure: export without fingerprint must fail loudly, not silently produce an unidentifiable dataset.
- [ ] Stale state: manifest version key changes whenever filters change.
- [ ] Privacy: E2E-encrypted chats are excluded from both splits (open question B1, see epic Open Questions).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
