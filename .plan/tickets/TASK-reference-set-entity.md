<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Persisted Reference-Set Entity (Table + Migration + Polymorphic Link)

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-reference-conditioned-generation
**Related:** `TASK-reference-set-multi-image-upload.md`, `TASK-reference-set-alt-text-consistency.md`, `TASK-illustrated-book-reference-pass.md`, `TASK-comparison-set-variant-data-model.md`, `src/db/enums-content.ts`, `src/assets/service/links.ts`, `src/db/schema-content.ts`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

Create the persisted reference-set entity — table, append-only migration, and a
polymorphic asset link — that Phase 0 of `epic-reference-conditioned-generation`
(bound via the **Epic:** header) needs as the storage half of its
multi-reference conditioning request model. Verified: no such entity exists
anywhere in the codebase, and three consumers already assume it does.

## Context

**Verified ground state:**

- `grep -E '(?i)(reference_?set|referenceSet|reference_?image|multi.?reference)'
  src/` → **0 matches**. There is no persisted reference-set entity, no
  reference-set table, and no reference-image column anywhere in `src/`.
- Consumers that already assume the entity exists:
  - `TASK-illustrated-book-reference-pass.md:66-70` builds an **EPHEMERAL**
    publication-scoped set per run (accepted illustrations, nearest-first,
    pinned always in, rejected never) — that builder has nowhere to persist.
  - `TASK-comparison-set-variant-data-model.md:41-44` carries `reference_set`
    as a JSON field on the variant — a second, incompatible encoding of the
    same concept, pointing at a table that does not exist.
  - The epic's Phase 0 multi-reference conditioning request model (ordering +
    role contract) is the request half; this ticket is its storage half.

**CRITICAL closed-union change.** `AssetLinkEntity`
(`src/db/enums-content.ts:73-84`) has exactly **10** members — chat, character,
world, actor, location, quest, item, memory, message, asset — and none is a
reference set. `linkAsset` (`src/assets/service/links.ts:23`) takes
`link.entityType: AssetLinkEntity`, so linking a reference asset to a
reference set **requires a new union member**. That addition is an explicit
item of this ticket, not an assumption; the union is closed and every
exhaustive consumer must be updated with it.

**Reuse:**

- `createAsset` / `linkAsset` (`src/assets/service/create.ts:37`,
  `src/assets/service/links.ts:23`) — reference assets are ordinary `assets`
  rows; no reference-specific blob path.
- `assets.content_hash` (`src/db/schema-content.ts:55`; uniqueness from
  `030_assets_content_hash_unique.ts`) — the same reference image uploaded
  twice is one asset; the set links it once per position.
- `assets.alt_text` (`src/db/schema-content.ts:49`) — VLM captions; the
  consistency signal consumed by
  `TASK-reference-set-alt-text-consistency.md`.

**A reference set is ORDERED.** The request model's ordering contract
(position + role) is the point; the join table carries an explicit position —
not set semantics.

**Migration policy:** append-only per `src/db/migrations/README.md` — never
delete/rename/renumber/rewrite a shipped migration. HEAD is
`src/db/migrations/056_xp_ledger_dedupe_unique.ts`, so this lands as
`src/db/migrations/NNN_reference_sets.ts` with `up(db)` / `down(db)`
(auto-discovered — no wiring step). Regenerate via `bun run db:sync-types &&
bun run db:sync-manifest` then `bun run schemas:check`; verify with `bun test
src/db/migrations.test.ts src/db/migration-roundtrip.test.ts`.

**Not owned here:** the transport (`/upload/image`, the template interface,
registry, `client_id` + `/ws`) stays with `epic-comfyui-plugin.md` — the
multi-image upload half is `TASK-reference-set-multi-image-upload.md` and it
extends the existing client helper, not the transport. No new workflow-template
DSL, no new intent taxonomy.

## Acceptance Criteria

- [ ] `reference_sets` (owner/scope, name, created_at) + ordered
      `reference_set_items` (set_id, asset_id, position, optional role) land
      in one append-only `src/db/migrations/NNN_*.ts` with `up`/`down`
- [ ] `AssetLinkEntity` (`src/db/enums-content.ts:73-84`) gains **exactly one**
      new member for the reference set; every exhaustive consumer updated —
      the closed-union change is explicit
- [ ] Ordering round-trips through Kysely as stored (the DB does not sort it)
- [ ] Dedup via `assets.content_hash`: the same bytes linked twice do not
      duplicate asset rows; re-linking one position is idempotent
- [ ] An empty reference set is representable and readable (the first
      illustration has no prior art — `TASK-illustrated-book-reference-pass.md:69-70`)
- [ ] Regeneration chain clean (`db:sync-types && db:sync-manifest &&
      schemas:check`); `bun test src/db/migrations.test.ts
      src/db/migration-roundtrip.test.ts` green
- [ ] No transport endpoint, template-interface change, or intent-taxonomy
      addition; `epic-comfyui-plugin.md` is not edited
