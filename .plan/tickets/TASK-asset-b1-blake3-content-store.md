<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Asset B1 — BLAKE3 content-addressed store (blob + refcount)

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** `epic-asset-platform-capabilities` (Batch B1)
**Related:** `TASK-asset-b1-rendition-pipeline.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

Add `assets.blake3` + a blob/refcount layer so identical bytes store once and
link many times. Builds on the SHA-256 per-owner dedup
(`src/assets/service/create.ts:26-38`, unique key
`030_assets_content_hash_unique.ts:93-102`); does not replace it.

## Context

Ground state: `createAsset` hashes with `Bun.CryptoHasher("sha256")`
(`create.ts:28`) into nullable `content_hash` (`src/db/schema-content.ts:55`),
scoped per `(owner_id, content_hash, encryption_tier, encrypted_key_id)`
(`create.ts:152-154`) with upsert arbitration (`:156-166`). No `blake3`
column, no blob table, no refcount — `storage_path` is per-assetId
(`src/assets/service/file-system.ts`), so identical bytes re-store per row.
`asset_links` (`001_init.ts:385-394`) is the link set refcount derives from;
`deleteAsset` already GCs derivatives via `entity_type='asset'`
(`src/assets/service/delete.ts:48-53`).

Prerequisites — the B1 Defect tickets (fix first, in epic order; the B1
design assumes current dedup is at least correct):

- `BUG-comfyui-edit-provider-persists-nothing-ownerid-system-violat.md` (Not Started) — provider cannot persist at all
- `BUG-asset-dedup-collapses-all-users-edits-onto-one-system-owned-.md` (Not Started) — cross-tenant row collapse
- `BUG-new-edit-iterations-collapse-onto-an-existing-asset-row-inst.md` (Done, `dedupe: false` flag) — keep honored: derivative paths must bypass blob-reuse, not just row-reuse
- `BUG-asset-dedup-ignores-requested-encryption-tier-and-key-return.md` (Not Started) — sets final dedup key columns
- `BUG-createasset-content-hash-dedup-is-a-check-then-act-race-with.md` (Not Started) — partial unique index + upsert precedent to copy
- `BUG-image-edit-derivative-link-files-an-asset-id-under-entity-ty.md` (Not Started) — derivative GC shape

## Acceptance Criteria

- [ ] `assets.blake3` column (forward migration, never edit `001_init`) +
  lookup index; computed at upload alongside `content_hash`
- [ ] Blob layer: one stored object per blake3; `asset_links` (+ rendition
  rows) refcount it; zero-ref rows swept after retention window; sweep never
  touches referenced rows
- [ ] Cross-user dedup for public tier (identical bytes, different owners →
  one blob, two rows/links); encrypted tiers stay key-scoped per the
  encryption-tier BUG; `dedupe: false` callers store distinct blobs
- [ ] Migration round-trips up→down→up under
  `src/db/migration-roundtrip.test.ts`; concurrent identical uploads yield
  one blob (030 race-test precedent)
