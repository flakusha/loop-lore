// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 085_chat_variant_backfill
 *
 * Backfills the chat-variants taxonomy onto legacy (taxonomy-blind) chats —
 * the cross-cutting "migration of legacy chats into the taxonomy" row of the
 * Chat Variants cluster (.plan/backlog/priority-p3-p5.md), closing the gap
 * 044_chat_purpose left: `chats.purpose` shipped nullable with NO backfill
 * ("null = no specific purpose"), and only variant-driven creates
 * (`resolveVariantOverrides` in src/routes/chats/create) ever write it. So
 * `purpose IS NULL` identifies the legacy population exactly.
 *
 * Spec: .plan/tickets/TASK-chat-variant-legacy-backfill.md (mapping rules
 * table). Conservative classify-or-leave-NULL policy — ONE single-pass
 * UPDATE per direction, only on rows with `purpose IS NULL`, and only
 * `purpose` is ever written. The R1/R2/R3 predicates are pairwise disjoint,
 * so a precedence-ordered CASE (R1→R2→R3) classifies exactly as the ordered
 * reading would:
 *   R1  world_id IS NOT NULL                          → 'rpg'         (11 rpg / 12 rpg_group by type)
 *   R2  world_id IS NULL AND mode = 'battle'          → 'validation'  (6 llm_only / 7 llm_only_group by type)
 *   R3  world_id IS NULL, non-battle, gm_config carries a `.validation` block
 *                                                     → 'validation'  (6/7 by type)
 * Everything else (plain 1:1, group social/character/assistant, VN-flagged,
 * GM-role chats, corrupted gm_config) is ambiguous — variants 1-5/8-10 are
 * indistinguishable on the observed columns — and deliberately stays NULL.
 *
 * R1 outranks R2 because RPG battles are world-gated
 * (checkCommandMechanic(db, chat.worldId, …)): a world-bound battle chat is
 * an RPG party chat, not a validation harness. `json_valid` guards R3 against
 * malformed gm_config so a corrupt row stays unclassified instead of throwing.
 *
 * PURE DATA MIGRATION — zero schema change (no ADD/DROP COLUMN, no generated
 * artifact regeneration). `type`/`mode` are never rewritten: mode drives
 * rendering + turn-orchestration defaults (MODE_DEFAULTS), and flipping
 * legacy 'direct'/'group' modes would silently change existing chats.
 *
 * Numbering: 085 is the lowest free slot on dev (084_lore_reveal_condition_timeline_rarity
 * landed on dev first; 083_immersion_decision_log was the tail when this was written as 084).
 *
 * down() is loss-tolerant by recompute (047_conversation_merge style): the
 * same classifier shapes reset `purpose` back to NULL. A variant-era row that
 * shares a classifier shape (a world-bound rpg chat created through the
 * create route) also loses its purpose on down(); re-running up() re-derives
 * the identical classification, and in a full-chain rollback 044_chat_purpose
 * drops the column anyway, so no state is reachable where the value survives.
 */
import { type Kysely, sql, } from "kysely";

/** @param database */
export async function up(database: Kysely<unknown>,): Promise<void> {
  // ONE statement, ONE pass: the R1/R2/R3 predicates are pairwise disjoint
  // (world-bound / world-less battle / world-less non-battle harness), so a
  // single precedence-ordered CASE classifies exactly as the ordered
  // R1→R2→R3 reading would — without three sequential table scans. A single
  // UPDATE is atomic on its own; the migrator wraps the migration besides.
  await sql`
    UPDATE chats
    SET purpose = CASE
      WHEN world_id IS NOT NULL THEN 'rpg'
      WHEN world_id IS NULL AND mode = 'battle' THEN 'validation'
      WHEN world_id IS NULL
        AND mode <> 'battle'
        AND gm_config IS NOT NULL
        AND json_valid(gm_config)
        AND json_extract(gm_config, '$.validation') IS NOT NULL
        THEN 'validation'
      ELSE purpose
    END
    WHERE purpose IS NULL
      AND (
        world_id IS NOT NULL
        OR mode = 'battle'
        OR (
          mode <> 'battle'
          AND gm_config IS NOT NULL
          AND json_valid(gm_config)
          AND json_extract(gm_config, '$.validation') IS NOT NULL
        )
      )
  `.execute(database,);
}

/** @param database */
export async function down(database: Kysely<unknown>,): Promise<void> {
  // Single-pass inverse: reset `purpose` on exactly the shapes up() wrote
  // (same pairwise-disjoint predicates, value+shape conjuncts OR'd).
  await sql`
    UPDATE chats
    SET purpose = NULL
    WHERE purpose IS NOT NULL
      AND (
        (purpose = 'rpg' AND world_id IS NOT NULL)
        OR (purpose = 'validation' AND world_id IS NULL AND mode = 'battle')
        OR (
          purpose = 'validation'
          AND world_id IS NULL
          AND mode <> 'battle'
          AND gm_config IS NOT NULL
          AND json_valid(gm_config)
          AND json_extract(gm_config, '$.validation') IS NOT NULL
        )
      )
  `.execute(database,);
}
