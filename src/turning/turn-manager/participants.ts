import { TurnStrategy, } from "../../db/enums";
import type { TurnParticipant, } from "../types";
import type { TurnManagerHost, } from "./types";

/**
 * Fetch participants eligible for turn selection.
 *
 * @param mode - "story" filters to ai/narrator/npc; "group" includes all non-user agents
 */
export async function fetchTurnParticipants(
  host: TurnManagerHost,
  mode: "story" | "group" = "story",
): Promise<TurnParticipant[]> {
  const query = host.db
    .selectFrom("chat_participants",)
    .innerJoin("actors", "actors.id", "chat_participants.actor_id",)
    .select([
      "chat_participants.actor_id",
      "actors.actor_type",
      "actors.agent_type",
      "chat_participants.talkativity",
    ],)
    .where("chat_participants.chat_id", "=", host.chatId,);

  const filtered = mode === "story"
    ? await query.where("actors.agent_type", "in", ["ai", "narrator", "npc",],).execute()
    : await query.where("actors.agent_type", "!=", "none",).execute();

  const participants: TurnParticipant[] = Array.from(filtered, (p,) => ({
    actorId: p.actor_id,
    type: p.actor_type,
    agentType: p.agent_type,
    talkativity: p.talkativity ?? 5,
  }),);

  // Inject initiative scores when using initiative strategy
  if (host.state?.strategy === TurnStrategy.Initiative) {
    const currentScene = "main"; // TODO: detect actual current scene from story_state
    const initiatives = await host.db
      .selectFrom("group_initiatives",)
      .select(["actor_id", "score",],)
      .where("chat_id", "=", host.chatId,)
      .where("scene_id", "=", currentScene,)
      .execute();

    const initiativeMap = new Map(Array.from(initiatives, (i,) => [i.actor_id, i.score,],),);
    for (const p of participants) {
      const score = initiativeMap.get(p.actorId,);
      if (score != null) {
        p.initiativeScore = score;
      }
    }
  }

  return participants;
}

export async function refreshTurnOrder(
  host: TurnManagerHost,
  mode: "story" | "group" = "story",
): Promise<void> {
  if (!host.state) { return; }
  const participants = await fetchTurnParticipants(host, mode,);
  const typeOrder: Record<string, number> = { narrator: 0, ai: 1, npc: 2, };
  participants.sort((a, b,) => {
    const aOrder = typeOrder[a.agentType] ?? 99;
    const bOrder = typeOrder[b.agentType] ?? 99;
    return aOrder - bOrder;
  },);
  host.state.turnOrder = Array.from(participants, (p,) => p.actorId,);
}

/** Update turn order (e.g., participant added/removed) */
export async function refreshOrderPublic(
  host: TurnManagerHost,
  mode: "story" | "group" = "story",
): Promise<void> {
  await refreshTurnOrder(host, mode,);
}
