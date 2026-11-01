<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Fine-tune Evaluation & Promotion Gate

**Effort:** Medium
**Type:** epic
**Tags:** training, finetune, evaluation, promotion-gate, datasets
**Overview:** (see sections below)


**Status:** Not Started
**Status Note:** Not Started
**Priority:** High

## Summary

Every ticketed training lane ends at "artifact exists": `c0def4e` stores *training* metrics (loss), `3f57ed6`'s compare-vs-base step lives in Together's console, and the only eval epic (`epic-rag-evaluation-observability.md`, `9ef32dd`) is retrieval-scoped. No owner exists for: carving a validation split at export time, generating held-out character prompts, running base-vs-adapted comparisons in-product, and gating registry/promotion of the trained id (the point where a bad adapter could silently degrade every chat or image). Coverage check: `giwt search eval` → 86 hits, none mention fine-tune/model promotion; `search finetune` → 7 hits, none eval (2026-11-01). The generic judge substrate is already proposed (`TASK-eval-rubric-judge-tiered-runner` `37299f7`: `src/eval/judge.ts` pointwise+pairwise under `epic-rag-evaluation-observability.md`) — this epic *consumes* it for the training lane instead of rebuilding it.

## Scope

- Val-split + BLAKE3 dataset fingerprint at export (first ticket).
- Held-out character-prompt generation for base-vs-adapted comparison.
- In-product comparison runs and a promotion gate before a trained id enters the serving registry.

## Related Epics

- `epic-training-finetune-datasets.md` — dataset export + trainer seams (upstream).
- `epic-lora-discovery-application.md` — serving side the gate protects.
- `epic-rag-evaluation-observability.md` — judge substrate (`37299f7`) consumed, not rebuilt.

## Tickets

- `TASK-val-split-and-blake3-dataset-fingerprint-at-export` (`b03de66`, High) — val-split + BLAKE3 fingerprint at export.

## Open Questions

- **B1 (blocking):** E2E-encrypted chats are unreadable server-side (`messages.key_id` `:790`, `e2e_payload` `:819`, `src/crypto/chat-keys.ts`) — `buildChatSFT` silently excludes them or needs a client-side decrypt opt-in. Decide before implementing `64d38ce`; affects the whole track-(a) data-volume claim.
- **B3 (blocking for the hosted track-(b) lane only):** whether mainstream hosted image trainers' current ToS accept adult-content training data is unverified — the local-first recommendation does not depend on it, but ticket `9dca720` (Replicate lane) must carry this check before any NSFW dataset upload.
- **N4 (nit):** hosted-text-trainer ToS on adult *text* content likewise unverified; the consent gate is in scope, the ToS check is not yet ticketed.
