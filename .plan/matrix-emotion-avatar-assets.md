<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Matrix: Emotion-Avatar & Asset Platform

**Scope:** cross-epic integration surface for the avatar-visual pipeline and
asset substrate epics: message binding, regeneration control, transform
metadata, alpha/VN layering, wardrobe variants, asset platform capabilities.
**Epics:** `epic-emotion-avatar-message-binding.md`,
`epic-avatar-regeneration-control.md`, `epic-asset-transform-metadata.md`,
`epic-avatar-alpha-vn-layering.md`, `epic-wardrobe-avatar-variants.md`,
`epic-asset-platform-capabilities.md`
**Status:** Proposed (design-stage; rows are doc-resolved unless marked open)
**Tags:** integration, matrix, avatar, emotion, assets, wardrobe, renditions

## Feature Evaluation

| Capability | Owner epic | Consumed by | Notes |
| ---------- | ---------- | ----------- | ----- |
| Per-message emotion binding (`messages.emotion` → variant) | binding | regen (slot replace), wardrobe (emotion axis), alpha/VN (sprite content), transforms (framing at render) | migration + schema landed; render path open |
| Regeneration scope (`emotions? × outfit_id`, replace-vs-append) | regeneration-control | wardrobe variant grid, GC churn, transform inheritance | slot replace = re-point binding, then cleanup |
| Persistent job state (DB-backed, restart-surviving) | regeneration-control | alpha matting jobs, batch gen, future async asset ops | one async-job convention, not per-feature Maps |
| Context transforms (`avatar_circle…sprite` crop/zoom/focal) | asset-transform-metadata | chat render, VN compositor, wardrobe grid, B5 ops | metadata-first; bake = rendition |
| Deterministic ops lists (JSON transform programs) | asset-platform B5 | assistant tooling, sticker auto-cutout, regen replay | supersedes single-row transforms (AV3) |
| Alpha pipeline (capability flag, matting fallback, `has_alpha`) | avatar-alpha-vn-layering | VN compositor, sticker packs, bubble render | matted/raw relation = AV4 |
| Wardrobe variants (`outfit_id × emotion`) | wardrobe-avatar-variants | selection ladder, regen scope, chat outfit overrides | extends `TASK-character-multi-avatar` design |
| Selection fallback ladder `(outfit,emotion)→(outfit,neutral)→(default,emotion)→base` | wardrobe-avatar-variants | binding render, gallery, VN | deterministic + test-pinned precedence |
| Content addressing (BLAKE3 dedup) + renditions + EXIF strip | asset-platform B1 | everything byte-bearing; gallery/bubble load path | regen byte-cost absorber |
| Asset lifecycle GC (refcount, soft-delete, budget) | asset-platform B3 | regen replace, matting pair cleanup, shares | safety net under all replace-semantics |
| Machine surface (alt/caption/VLM desc, pHash, backlinks) | asset-platform B4 | RAG ingestion, assistant context, find-similar, GC input | gated on aux Captioning decision (AV8) |

## Pairwise Integration Gaps

| # | System A | System B | Status | Required integration |
| - | -------- | -------- | ------ | -------------------- |
| AV1 | Regen | Binding | ✅ doc-resolved | Slot re-point must invalidate frontend emotion→avatar caches; failed re-roll never unbinds (no avatar-less window) |
| AV2 | Regen | Platform-B3 GC | ✅ doc-resolved | Regen stops deleting directly: replace = rebind + release ref; GC retention window provides undo, sweep finalizes |
| AV3 | Transforms (context rows) | Platform-B5 ops lists | ⚠️ open | Two storages for one concept. Decision needed before B5: ops-list becomes canonical (single crop = 1-op program) with transform rows as view; ship S3 v1, migration ticket booked at B5 design |
| AV4 | Alpha (raw+matted pair) | Platform-B1 dedup/renditions | ⚠️ open | Matted output = rendition of raw (inherits dedup/GC) vs second linked root asset. Rendition preferred (one identity, no emotion re-binding); confirm Bun-side storage ergonomics at implementation |
| AV5 | Wardrobe | Binding render | ✅ doc-resolved | Resolver contract `(actorId, chatId, at) → outfit_id` owned by wardrobe; binding/render consumers call it, never infer outfit themselves |
| AV6 | Wardrobe | Regen scope | ✅ doc-resolved | Regen `emotions?` filter gains `outfit_id?` in same validation-schema change that adds subset filter — don't land two incompatible job param generations |
| AV7 | Transforms | Alpha/VN | ✅ doc-resolved | `sprite` transform context carries anchor/scale the VN compositor needs; bake path (derive) emits alpha-preserving rendition |
| AV8 | Platform-B4 | aux-enrichment-pipeline | ⚠️ open | Captioning wiring depends on aux epic's dead-role decision (wire vs remove `ModelRole.Captioning`); if removed, B4 must re-add the role first — sequence or merge the tickets |
| AV9 | Binding/wardrobe jobs | Platform async jobs | ✅ doc-resolved | Single `asset_jobs` (or shared async-job) table convention adopted by regen, matting, batch-gen; job-store.ts Map demoted to cache |
| AV10 | Platform-B2 albums | story-coherence message kinds | ⚠️ open | Album/carousel = new message kind vs attribute on existing kind — MUST reconcile with the `narration\|actor_action\|system` axis (see `matrix-story-coherence.md`); kind enum is shared vocabulary, one axis each |
| AV11 | Wardrobe | immersion-consistency-gate | ✅ doc-resolved | Player-initiated outfit change is an actor-state claim routed through the gate (story continuity); NPC/world-rule outfit binding is system-authored, bypasses |
| AV12 | Platform-B5 ops | assistant tool registry | ✅ doc-resolved | Ops emission lands as assistant tool (deterministic, auditable); GM-flow prompts gain "asset edit" intent only after executor exists |
| AV13 | Transforms/renditions | frontend-gallery | ✅ doc-resolved | Gallery cards + chat bubbles switch to `thumb_*` renditions with LQIP; existing 4:3 CSS card contract unchanged |

## Shared Data Contracts (design-stage)

| Contract | Shared by | Purpose |
| -------- | --------- | ------- |
| `EmotionType` enum (`src/db/enums-character/avatar.ts`) | binding, regen, wardrobe, aux classifier | single emotion vocabulary — binding epic cites stale path `src/db/enums-character.ts`, fix at bookkeeping |
| `asset_links` (polymorphic) | all — refcount source for GC, backlinks input | the join every batch queries |
| `assets.blake3` + `has_alpha` | B1 store path; regen/matting write through it | identity + render-branch flag |
| `asset_renditions.kind` vocabulary | B1, transforms derive, alpha matted, VN bake | namespaced: `thumb_s\|thumb_l\|lqip\|poster\|baked\|matted\|stripped` |
| `asset_jobs` (proposed) | regen, matting, batch gen, ops executor | durable status; cancel; restart reconciliation |
| outfit resolver `(actor, chat, t) → outfit_id` | wardrobe ↔ binding/gallery/VN | single source for the appearance axis |

## Existing Ticket Reconciliation

| Existing ticket | Disposition |
| --------------- | ----------- |
| `TASK-emotion-avatar-edit-model` (42L) / `TASK-emotions-avatar-edit-model` (238L) | near-duplicate pair — fold the short one into the 238L parent at bookkeeping; Phase-2 (edit-model stability) stays its own ticket |
| `TASK-aux-emotion-avatar`, `TASK-aux-llm-emotion-classifier`, `TASK-aux-enrichment-emotion-avatar-task`, `TASK-emotion-intent-detection` | detection axis — feed binding epic's sources; no new owner, keep as-is |
| `TASK-actor-emotion-avatars-frontend` / `TASK-actor-emotion-avatars-frontend-panel` | pair — merge into one frontend ticket scoped to binding-epic render tasks; grid grouping-by-outfit deferred to wardrobe |
| `BUG-avatar-select-empty-throws-no-frontend-fallback`, `BUG-avatar-select-fallback-chain-unwired`, `BUG-avatar-selection-rule-unimplemented-branches`, `TEST-avatar-selection-fallback-empty-coverage` | selection-axis bugs — become wardrobe-epic fallback-ladder prerequisites (fix first, ladder tests pin them) |
| `BUG-emotion-mood-hook-payload-missing-actor-chat`, `BUG-emotion-mood-hook-stale-llm-javadoc`, `BUG-emotion-avatar-fallback-metadata-incomplete` | binding-epic prerequisites (hook payload is the persist path) |
| `TEST-emotion-hook-to-avatarForMessage-integration` | binds to binding epic acceptance list |
| `TASK-character-multi-avatar` (364L) | **parent design** for wardrobe epic — wardrobe extends its selection algorithm with the outfit axis; keep open, cross-link |
| `TASK-character-emotion-definitions-crud-ui`, `TASK-memory-emotion-impact`, `TASK-nsfw-mood-emotional`, `TASK-input-validation-battle-schema-less-post-emotion-avatars-par`, `WIRE-characters-create-avatar-linking-missing` | adjacent, unchanged |
| `TASK-doc-spec-emotion-avatars`, `BUG-stale-audit-claim-aux-emotion-mood-task-tables` | bookkeeping-only — close/refresh when epics land |

## Post-Land Bookkeeping (after this branch finalizes)

- [ ] Create git tickets from epic work-item checkboxes (`worktree/ ticket TASK
      "<epic>: <item>" …`): regen (7), transforms (8), alpha (7), wardrobe (8),
      platform B1–B5 (batch-level first, decompose per batch)
- [ ] Execute the ticket reconciliations above (fold two pairs, cross-link
      multi-avatar parent, attach selection bugs to wardrobe prerequisites)
- [ ] Repair binding-epic drift: `character_avatars` table and
      `avatar-service.ts` / `enums-character.ts` paths do not exist at this tip
      (real: `avatar-service/` dir, `enums-character/avatar.ts`)
- [ ] Resolve ⚠️-open rows AV3/AV4/AV8/AV10 or convert each to a decision
      ticket under the owning epic
- [ ] Re-run `bun run plan:docs` + `plan:sync:fix`; refresh README matrix
      registry if scope renames

## Related

- `matrix-story-coherence.md` — AV10 shares the message-kind axis; AV11 hooks
  into the immersion gate
- `epic-messages.md`, `epic-frontend-gallery.md`, `epic-aux-enrichment-pipeline.md`,
  `epic-rag-*.md` — consumer/dependency surfaces cited per epic
