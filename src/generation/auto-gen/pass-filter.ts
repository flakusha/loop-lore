// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Cascade `[PASS]` opt-out filter.
 *
 * Actors who ended their most recent message with `[PASS]` decline their
 * turn without forcing the cascade to spin up an LLM call for them
 * (BUG-group-chat-silence-pass-not-implemented).
 */
import { type Kysely, sql, } from "kysely";
import type { DB, } from "../../db/schema";
import { detectPassToken, } from "../../group-chat/mention-parser";
import type { Logger, } from "../../logger/types";
import type { GenDeps, } from "./deps";

/** One AI participant row as loaded by the cascade participant query. */
export interface PassFilterParticipant {
  actor_id: string;
  actor_type: string;
  agent_type: string;
  display_name: string;
}

/** */
export interface PassFilterOpts {
  database: Kysely<DB>;
  chatId: string;
  aiParticipantsRaw: PassFilterParticipant[];
  deps: Pick<GenDeps, "getChatEncryptionLevel" | "decryptAtRest">;
  log: Logger;
}

/** */
export interface PassFilterResult {
  /** Participants that did NOT opt out. */
  eligible: PassFilterParticipant[];
  /** Count of opted-out participants (for logging). */
  filtered: number;
}

/**
 * Remove actors whose latest message ends with `[PASS]`.
 * @param opts
 */
export async function filterPassedActors(opts: PassFilterOpts,): Promise<PassFilterResult> {
  const { database, chatId, aiParticipantsRaw, deps, log, } = opts;
  // Latest message PER ACTOR via a correlated NOT EXISTS: a row is latest
  // only when no newer row exists for the same (chat, actor). A plain
  // `created_at IN (SELECT max ... GROUP BY actor)` cross-matches —
  // `created_at` is second-resolution text, so one actor's max timestamp
  // routinely equals another actor's (or an older same-actor row's),
  // wrongly opting actors out. `(created_at, rowid)` ordering breaks ties
  // by insertion order.
  const recentPassRows = await database
    .selectFrom("messages as m",)
    .select(["m.actor_id", "m.content_plaintext", "m.content", "m.key_id",],)
    .where("m.chat_id", "=", chatId,)
    // Only AI participants can be opted out; bounding the outer scan also
    // keeps the correlated lookup proportional to participants, not chat size.
    .where(
      "m.actor_id",
      "in",
      aiParticipantsRaw.map((p,) => p.actor_id),
    )
    .where((eb,) =>
      eb.not(
        eb.exists(
          eb.selectFrom("messages as newer",)
            .select("newer.id",)
            .whereRef("newer.chat_id", "=", "m.chat_id",)
            .whereRef("newer.actor_id", "=", "m.actor_id",)
            .where(sql<boolean>`(newer.created_at, newer.rowid) > (m.created_at, m.rowid)`,),
        ),
      )
    )
    .execute();
  const passedActorIds = new Set<string>();
  for (const row of recentPassRows) {
    const plaintext = row.content_plaintext ?? await decryptCascadeRow(row,);
    if (detectPassToken(plaintext,)) { passedActorIds.add(row.actor_id,); }
  }

  async function decryptCascadeRow(row: (typeof recentPassRows)[number],): Promise<string> {
    // Unencrypted rows carry no key_id — nothing to decrypt (plaintext
    // column is null only because the writer omitted it). Encrypted rows
    // (client E2E or standard tier) are decrypted so [PASS] works in
    // encrypted chats too. Any failure fails OPEN: an unreadable message
    // keeps its author eligible rather than silently opting them out.
    if (!row.key_id) { return ""; }
    try {
      const level = await deps.getChatEncryptionLevel(database, chatId,);
      return await deps.decryptAtRest({
        database,
        chatId,
        storedContent: row.content,
        encryptionLevel: level,
      },);
    } catch {
      return "";
    }
  }
  const eligible: PassFilterParticipant[] = [];
  let filtered = 0;
  for (const p of aiParticipantsRaw) {
    if (passedActorIds.has(p.actor_id,)) {
      filtered++;
      log.debug("Cascade: actor opted out via [PASS]", { actorId: p.actor_id, chatId, },);
    } else { eligible.push(p,); }
  }
  if (filtered > 0) {
    log.info("Cascade: filtered opted-out actors", {
      chatId,
      filtered,
      remaining: eligible.length,
    },);
  }
  return { eligible, filtered, };
}
