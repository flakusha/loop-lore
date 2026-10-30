<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Chat Variant Legacy Backfill

**Status:** Done
**Status Note:** Shipped 2026-10-30 — migration `084_chat_variant_backfill` (pure data migration, no schema change) classifies per the mapping table: world-bound → `rpg`, world-less battle → `validation`, `gm_config.validation` block → `validation`; everything ambiguous stays NULL. `type`/`mode` untouched. `down()` is the documented recompute inverse; fixture tests in `src/db/migrations.test.ts` (up classification + down→re-up roundtrip) and the existing chain/roundtrip suites are green.
**Priority:** medium
**Effort:** Small
**Epic:** epic-chat-variants-taxonomy
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Classify pre-taxonomy (legacy) chats into the 12-variant chat taxonomy by backfilling chats.purpose. Design-first ticket: the mapping rules below are the spec; the implementation is a pure data migration (no schema change) with a conservative classify-or-leave-NULL policy.

**Context:**

Legacy chats predate the variants taxonomy: they are taxonomy-blind. From schema + migration history their observed shape is:

- `chats.type` (`chat_type`) — `NOT NULL DEFAULT 'direct'`, `CHECK type IN ('direct','group')` (001_init).
- `chats.mode` (`chat_mode`) — `NOT NULL DEFAULT 'direct'`, no CHECK (001_init). Legacy values are `'direct'`/`'group'`; `'story'`/`'battle'` only appear on template-preset or post-taxonomy rows.
- `chats.purpose` (`chat_purpose`) — added nullable by 044_chat_purpose with NO backfill ("null = no specific purpose"); only variant-driven creates (routes/chats/create via `resolveVariantOverrides`) ever write it. `purpose IS NULL` therefore identifies the legacy population.
- There is **no** `chats.visual_novel` column in this lineage (never created here); VN-ness lives in `gm_config` (`renderingOverride: "visual_novel"` / legacy `visualNovel` boolean). It is a rendering concern, not a taxonomy dimension — the 12 variants have no VN variant.
- `talkativity` lives on `chat_participants` (per-participant), not on `chats`; the variant-level `talkativity` default cannot be reconstructed from chat rows.
- `gm_config` is free-form JSON (`assistantRole`: off/helper/gm/moderator, `renderingOverride`, `validation`, `cast`, `moderation`, `gm_profile`, …). RPG chats are the ones bound to a world (`chats.world_id` — variant 11/12 "attached to a world, in a location, rules enforced"); RPG battle commands are world-gated (`checkCommandMechanic(db, chat.world_id, …)`), so `mode='battle'` without a world can only be the LLM↔LLM validation harness (variants 6/7).

**Mapping rules (the spec):**

Evaluated once per row by migration `084_chat_variant_backfill`, in order, only on rows with `purpose IS NULL`. Only `chats.purpose` is written — `type`/`mode` are never rewritten (mode drives rendering/turn-orchestration defaults; flipping legacy `direct`/`group` modes would silently change existing chats' behavior). Unmapped rows stay `purpose = NULL` = unclassified, by design.

| # | Observed legacy shape | → variant | purpose set | Rationale |
|---|---|---|---|---|
| R1 | `world_id IS NOT NULL`, any type/mode | 11 rpg (`direct`) / 12 rpg_group (`group`) | `'rpg'` | World binding is the defining RPG property; unambiguous. Takes precedence over R2/R3. |
| R2 | `world_id IS NULL AND mode = 'battle'` | 6 llm_only (`direct`) / 7 llm_only_group (`group`) | `'validation'` | Battle without a world can only be the LLM↔LLM validation harness (RPG battles are world-gated). |
| R3 | `world_id IS NULL AND mode <> 'battle' AND json_valid(gm_config) AND json_extract(gm_config,'$.validation') IS NOT NULL` | 6/7 by type | `'validation'` | The `GmConfig.validation` block exists only on the llm-only variants' union type. `json_valid` guards malformed JSON (row stays unclassified, migration must not throw). |
| — | everything else (plain 1:1, group social/character/assistant, VN-flagged, `assistantRole:'gm'` GM chats, corrupted `gm_config`) | unclassified | stays `NULL` | `direct`+non-battle rows could be variants 1/3/9 equally; `group` rows could be 2/4/5/8/10 equally; GM-role fits 8 and 11 both. Ambiguous → NULL. |

**Acceptance Criteria:**

- [x] Migration `084_chat_variant_backfill` (pure data migration, zero schema change) classifies per R1–R3 in one transaction; `type`/`mode` untouched; ambiguous rows stay NULL.
- [x] Rows that already carry a taxonomy purpose (variant-era creates) are never modified.
- [x] `down()` restores the pre-backfill state deterministically (recompute: same classifier shapes reset `purpose` to NULL); roundtrip up→down→up is stable.
- [x] Fixture tests: plain 1:1 (stays NULL), group social (stays NULL), VN chat (stays NULL), battle/validation direct+group (→ validation), rpg with world binding direct+group (→ rpg), battle group with world (→ rpg, R1 precedence), gm_config validation block (→ validation), GM-role chat (stays NULL), corrupted gm_config (stays NULL, no throw), pre-purposed variant rows (untouched).
- [x] Backlog row (priority-p3-p5.md Chat Variants cluster, cross-cutting) updated to shipped.

**Related:** .plan/backlog/priority-p3-p5.md (Chat Variants Taxonomy cluster, cross-cutting row), src/routes/chats/create-variant.ts, src/chat/types/variants.ts, src/db/migrations/044_chat_purpose.ts
