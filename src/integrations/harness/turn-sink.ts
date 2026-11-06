// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * turn-sink.ts — one chat binding that turns a resolved harness turn into
 * message rows plus live SSE frames.
 *
 * Rows land first (they are the record), frames follow (best-effort). A
 * caller that retries a turn passes the same turn key: the second write is
 * then a no-op instead of a duplicate set of rows.
 */

import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import { MessageStatus, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { type HarnessTurnResult, } from "./adapter-types";
import { persistHarnessTurn, } from "./turn-persistence";
import { harnessTurnEndFrame, harnessTurnFrames, pushHarnessFrame, } from "./turn-sse";

/** Options for one turn sink. */
export interface CreateHarnessTurnSinkOptions {
  /** The database the rows land in. */
  database: Kysely<DB>;
  /** Chat the turns belong to. */
  chatId: string;
  /** Actor the turns are attributed to. */
  actorId: string;
  /** Harness profile the turns come from. */
  profile: string;
}

/** The sink a consumer hands to the harness bridge. */
export interface HarnessTurnSink {
  /**
   * Persist a resolved turn and push its frames.
   * @param turn - the resolved turn, transcript included
   * @param turnKey - idempotency key; a replay with the same key writes nothing
   */
  onTurnResolved(turn: HarnessTurnResult, turnKey?: string,): Promise<void>;
}

/** The row status a turn ends with: a cancelled turn never completed. */
function turnStatus(stopReason: string,): MessageStatus {
  return stopReason === "cancelled" ? MessageStatus.Partial : MessageStatus.Confirmed;
}

/**
 * Build the sink for one (chat, actor, profile) binding.
 * @param options - the binding and its database
 * @returns the sink
 */
export function createHarnessTurnSink(options: CreateHarnessTurnSinkOptions,): HarnessTurnSink {
  const { database, chatId, actorId, profile, } = options;

  return {
    async onTurnResolved(turn: HarnessTurnResult, turnKey?: string,): Promise<void> {
      const status = turnStatus(turn.stopReason,);
      const persisted = await persistHarnessTurn({
        database,
        chatId,
        actorId,
        profile,
        transcript: turn.transcript,
        turn,
        turnKey: turnKey ?? randomUUID(),
        status,
      },);

      for (const frame of harnessTurnFrames(turn.transcript,)) {
        pushHarnessFrame(chatId, frame,);
      }

      pushHarnessFrame(
        chatId,
        harnessTurnEndFrame({
          messageId: persisted.assistantMessageId,
          stopReason: turn.stopReason,
          status,
        },),
      );
    },
  };
}
