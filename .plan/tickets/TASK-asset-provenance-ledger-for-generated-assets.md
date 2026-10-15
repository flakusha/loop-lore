<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Asset provenance ledger for generated assets

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-asset-platform-capabilities

**Summary:**

Add an asset_provenance table linking assets to the generation attempt, provider, model, seed and prompt hash that produced them.

**Context:**

Verified 2026-10-15 by source read:

- `assets` (`src/db/schema-content.ts:37-59`) has `content_hash`, `width`, `height`, `duration_secs`, `thumbnail_path`, `mime_type`, `asset_type`, `storage_backend`, `alpha_status` — **zero provenance columns**.
- `persistGeneratedImages` (`src/assets/service/persist-generated.ts:59-97`) records only the output-byte SHA-256 as the filename stem and `content_hash`.
- `generation_attempts` (`src/db/schema-generation.ts:15-51`) **is already a full text-generation provenance ledger**: `model_id`, `provider`, `idempotency_key`, `parent_attempt_id`, `step_index`/`total_steps`, `prompt_tokens`/`completion_tokens`/`total_tokens`, `generation_time_ms`, `cancel_reason`/`cancel_source`, `abort_signal_id`.

The gap: content-addressed re-runs collapse onto the existing row via `uq_assets_owner_content_*`, so a regenerated image is indistinguishable from a fresh one. There is no back-pointer from an asset to what produced it.

Design taken from `generation_attempts` (reuse the shipped pattern, don't invent a second one). `asset_id` is a **nullable** FK — nothing breaks, no backfill.

**Acceptance Criteria:**

- [ ] **Behaviour:** migration adds `asset_provenance (asset_id, generation_attempt_id, provider, model_id, seed, prompt_hash, params_json)`; retrievable by `asset_id`.
- [ ] **Behaviour:** a generated image links to its provenance row; an uploaded (non-generated) asset has no provenance row and no null row is invented.
- [ ] **Tests:** insert+read round-trip; a `dedupe: false` caller (`makeFilename` supplied) records provenance without collapsing; provenance survives a byte-identical re-run.
- [ ] **Edge cases:** `generation_attempt_id` pointing at a deleted attempt; `provider`/`model_id` exceeding column limits; `seed` non-numeric (some providers emit string seeds); `params_json` deeply nested; unicode in prompt-derived values.
- [ ] **Concurrency / TOCTOU:** two concurrent creates of byte-identical content with **different** provenance must not produce two rows or silently drop the first row's provenance — the provenance write follows the dedup conflict-skip insert, it does not precede it.
- [ ] **Security:** provenance never stores the raw prompt when the owning chat is encrypted — store the hash or the encrypted-envelope reference; per-owner read scoping matches the existing `content_hash` + `owner_id` partial indexes.
- [ ] **Regressions:** `src/db/migrations/030_assets_content_hash_unique.test.ts` still passes; gallery and serve paths unchanged.
- [ ] **Repo gates:** `bun run check` green; migration covered by `src/db/migrations.test.ts` and `src/db/migration-roundtrip.test.ts` (up→down→up).
