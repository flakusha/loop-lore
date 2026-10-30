// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 084_chat_variant_backfill
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
 * table). Conservative classify-or-leave-NULL policy — rules run in order,
 * only on rows with `purpose IS NULL`, and only `purpose` is ever written:
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
 * Numbering: 084 is the lowest free slot on dev (083_immersion_decision_log
 * is the current tail; nothing is parked past it).
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
  await database.transaction().execute(async (trx,) => {
    // R1 — world-bound chats are RPG chats (variant 11 direct / 12 group).
    await sql`
      UPDATE chats
      SET purpose = 'rpg'
      WHERE purpose IS NULL
        AND world_id IS NOT NULL
    `.execute(trx,);

    // R2 — battle mode without a world is the LLM↔LLM validation harness.
    await sql`
      UPDATE chats
      SET purpose = 'validation'
      WHERE purpose IS NULL
        AND world_id IS NULL
        AND mode = 'battle'
    `.execute(trx,);

    // R3 — a gm_config validation block only exists on the llm-only variants.
    // json_valid keeps corrupted gm_config rows unclassified instead of erroring.
    await sql`
      UPDATE chats
      SET purpose = 'validation'
      WHERE purpose IS NULL
        AND world_id IS NULL
        AND mode <> 'battle'
        AND gm_config IS NOT NULL
        AND json_valid(gm_config)
        AND json_extract(gm_config, '$.validation') IS NOT NULL
    `.execute(trx,);
  },);
}

/** @param database */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.transaction().execute(async (trx,) => {
    await sql`
      UPDATE chats
      SET purpose = NULL
      WHERE purpose = 'rpg'
        AND world_id IS NOT NULL
    `.execute(trx,);

    await sql`
      UPDATE chats
      SET purpose = NULL
      WHERE purpose = 'validation'
        AND world_id IS NULL
        AND mode = 'battle'
    `.execute(trx,);

    await sql`
      UPDATE chats
      SET purpose = NULL
      WHERE purpose = 'validation'
        AND world_id IS NULL
        AND mode <> 'battle'
        AND gm_config IS NOT NULL
        AND json_valid(gm_config)
        AND json_extract(gm_config, '$.validation') IS NOT NULL
    `.execute(trx,);
  },);
}
