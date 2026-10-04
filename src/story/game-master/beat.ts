// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Game Master Service — World-scoped Beat Entry Point
 *
 * `executeTurn` is chat-scoped and turn-driven: the only thing that ever
 * called it was `POST /api/chats/:id/story/step`. This module is the
 * world-scoped entry point a scheduler dispatch calls instead, and it owns
 * the one ambiguity that creates — the scheduler dispatches per WORLD, while
 * the GM narrates into a CHAT.
 *
 * Resolution rule — a world resolves to AT MOST ONE GM-capable chat
 * (a story-mode chat on that world):
 *   - zero  → `skipped: "gm_no_chat"`. Nothing to narrate into, and a beat
 *     would have to invent the chat. An invented chat is not a story.
 *   - two+  → `skipped: "gm_chat_ambiguous"`. Picking the first would make
 *     a replay of the same tick land in a different chat than the run it
 *     replays, and diverge from it — exactly the nondeterminism
 *     `docs/spec/autonomy-determinism.md` exists to prevent. A skip is loud
 *     and reproducible; an arbitrary pick is neither.
 *
 * The order `(created_at ASC, id ASC)` is total and matches
 * `SimulationStore.chatIdFor`, so the two never disagree about which chat is
 * first. This query adds the story-mode filter that `chatIdFor` — a
 * config-resolution helper that only wants *some* chat for the autonomy
 * config layers — deliberately does not apply. It supersedes `chatIdFor`
 * for the beat, which needs a GM-capable chat rather than any chat.
 */
import type { Kysely, } from "kysely";
import { ChatMode, GameMasterType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { jsonParseOr, } from "../../utils";
import type { GameMasterService, } from "./index";
import type { GmTurnResult, } from "./types";

/** How many chats to read: 1 to dispatch, 2 to detect ambiguity. Reading
 *  the full chat set only to learn "is there a second?" is wasted rows.
 */
const RESOLUTION_LIMIT = 2;

/** Chat columns a beat needs to build its GM session. */
export interface GmBeatChat {
  id: string;
  /** Raw `chats.gm_config` JSON column (null when unset). */
  gmConfig: string | null;
  /** Chat owner — the identity provider/API-key resolution bills against. */
  createdBy: string;
}

/**
 * Builds the GM service a beat runs on. Injected by the composition root
 * (which owns provider wiring) rather than re-derived here — see `createGm`
 * in `src/routes/story-orchestration/helpers.ts`.
 */
export type GmBeatFactory = (chat: GmBeatChat,) => GameMasterService | Promise<GameMasterService>;

/** Why a world got no beat. Each is a distinct, defined miss — none of them
 *  is "pick something anyway".
 */
export type GmBeatSkipReason =
  | "gm_no_chat"
  | "gm_chat_ambiguous"
  | "gm_requires_human"
  | "gm_paused"
  | "gm_story_complete";

/** What one beat did. `dispatched: 1` — a beat is one unit of work, so the
 *  scheduler's aggregate stays comparable with movement's per-NPC count.
 */
export type GmBeatResult =
  | { skipped: GmBeatSkipReason }
  | { dispatched: 1; turn: GmTurnResult };

/**
 * Resolve a world's GM-capable chats, in the documented total order.
 * @param db
 * @param worldId
 * @returns 0, 1, or 2 chats — never more, 2 already means ambiguous
 */
async function resolveBeatChats(
  db: Kysely<DB>,
  worldId: string,
): Promise<GmBeatChat[]> {
  const rows = await db
    .selectFrom("chats",)
    .select(["id", "gm_config", "created_by",],)
    .where("world_id", "=", worldId,)
    .where("mode", "=", ChatMode.Story,)
    .orderBy("created_at", "asc",)
    .orderBy("id", "asc",)
    .limit(RESOLUTION_LIMIT,)
    .execute();

  return rows.map((row,) => ({ id: row.id, gmConfig: row.gm_config, createdBy: row.created_by, }));
}

/**
 * The GM type a chat is configured for. An unset / unparseable config reads
 * as LLM, matching `createGm` and the decision registry's own fallback.
 * @param raw
 */
function gmTypeOf(raw: string | null,): string {
  return jsonParseOr<{ type?: string }>(raw ?? "{}", {},).type ?? GameMasterType.Llm;
}

/**
 * Run one GM beat for a world.
 *
 * No player turn and no human GM: an autonomous beat is simply the chat's
 * next scheduled turn. A `human`-type GM produces a placeholder for a human
 * to fill in, so it is skipped, never faked.
 *
 * Movement is delegated: `moveNpcs: false`, because the scheduler's
 * movement dispatch (registered before any extra target) already advanced
 * this world this tick. With movement on, one tick would move every NPC
 * twice.
 *
 * @param db
 * @param worldId
 * @param createGm - builds the provider-backed GM service for the chat
 * @throws {Error} When the beat is due but cannot run — no story context, no
 *   available actors, or a provider failure. The scheduler records these on
 *   the world's row; they are genuine errors, not skips.
 * @returns {Promise<GmBeatResult>}
 */
export async function runGmBeat(
  db: Kysely<DB>,
  worldId: string,
  createGm: GmBeatFactory,
): Promise<GmBeatResult> {
  const chats = await resolveBeatChats(db, worldId,);
  if (chats.length === 0) { return { skipped: "gm_no_chat", }; }
  if (chats.length > 1) { return { skipped: "gm_chat_ambiguous", }; }

  const chat = chats[0]!;
  if (gmTypeOf(chat.gmConfig,) === GameMasterType.Human) {
    return { skipped: "gm_requires_human", };
  }

  const gm = await createGm(chat,);
  await gm.initialize();

  // Pause and max-turns are the user's stop controls. `executeTurn` reads
  // neither, which is harmless on the HTTP route (a human has to keep
  // pressing step) but not here: the scheduler calls this unattended, so a
  // paused or finished story would keep narrating forever against the
  // operator's explicit setting. Both are checked after initialize(), which
  // is what loads the chat's story_state / max_turns.
  if (gm.isPaused) { return { skipped: "gm_paused", }; }
  if (gm.isComplete) { return { skipped: "gm_story_complete", }; }

  const turn = await gm.executeTurn(undefined, { moveNpcs: false, },);
  return { dispatched: 1, turn, };
}
