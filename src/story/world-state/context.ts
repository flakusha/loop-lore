/**
 * World State Service — Context Dispatcher
 *
 * buildContext: assemble the full StoryContext for the Game Master
 * from current DB state.
 */
import { jsonParseOr, } from "../../utils";
import { ItemsService, } from "../items";
import type { LocationState, NpcState, QuestConfig, StoryContext, } from "../types";
import type { WorldState, } from "./types";

/**
 * Build the full StoryContext for the Game Master
 * from the current DB state.
 */
export async function buildContext(
  state: WorldState,
  chatId: string,
  recentTurnCount = 10,
): Promise<StoryContext | null> {
  const chat = await state.db
    .selectFrom("chats",)
    .select(["world_id", "current_location_id", "story_state", "turn_strategy",],)
    .where("id", "=", chatId,)
    .executeTakeFirst();

  if (!chat?.world_id) { return null; }

  const world = await state.db
    .selectFrom("worlds",)
    .selectAll()
    .where("id", "=", chat.world_id,)
    .executeTakeFirst();

  if (!world) { return null; }

  let locationState: LocationState | null = null;
  let locName = "unknown";
  let locId = "";

  if (chat.current_location_id) {
    const loc = await state.db
      .selectFrom("locations",)
      .select(["id", "name", "description",],)
      .where("id", "=", chat.current_location_id,)
      .executeTakeFirst();

    if (loc) {
      locId = loc.id;
      locName = loc.name;

      const ls = await state.db
        .selectFrom("location_states",)
        .selectAll()
        .where("location_id", "=", chat.current_location_id,)
        .executeTakeFirst();

      if (ls) {
        locationState = {
          description_override: ls.description_override,
          atmosphere: ls.atmosphere,
          npcs_present: jsonParseOr(ls.npcs_present, [],),
          items_available: jsonParseOr(ls.items_available, [],),
          time_of_day: ls.time_of_day,
          weather: ls.weather,
          hazards: jsonParseOr(ls.hazards, [],),
        };
      }
    }
  }

  const questRows = await state.db
    .selectFrom("quests",)
    .selectAll()
    .where("world_id", "=", world.id,)
    .where("status", "=", "active",)
    .orderBy("priority", "desc",)
    .execute();

  const activeQuests = Array.from(questRows, (q,) => ({
    id: q.id,
    name: q.name,
    type: q.type,
    progress: q.progress,
    target: q.target,
    config: (() => {
      const parsed = jsonParseOr<QuestConfig | null>(q.config, null,);
      return parsed && typeof parsed.type === "string" ? parsed : ({} as unknown as QuestConfig);
    })(),
  }),);

  const participantRows = await state.db
    .selectFrom("chat_participants",)
    .innerJoin("actors", "actors.id", "chat_participants.actor_id",)
    .select([
      "actors.id",
      "actors.display_name",
      "actors.actor_type",
      "actors.agent_type",
      "actors.system_prompt",
    ],)
    .where("chat_participants.chat_id", "=", chatId,)
    .execute();

  const actors: StoryContext["actors"] = [];
  const items = new ItemsService(state.db,);
  for (const p of participantRows) {
    const npcRow = p.agent_type === "npc" || p.agent_type === "ai"
      ? await state.db.selectFrom("npc_states",).selectAll().where("actor_id", "=", p.id,).executeTakeFirst()
      : null;

    let npcState: NpcState | undefined;
    if (npcRow) {
      const scheduleData = jsonParseOr<Record<string, unknown>>(npcRow.schedule, {},);
      npcState = {
        health: npcRow.health,
        mental_state: npcRow.mental_state,
        knowledge: jsonParseOr(npcRow.knowledge, {},),
        relationships: jsonParseOr(npcRow.relationships, {},),
        inventory: await items.getNpcInventory(p.id,),
        schedule: jsonParseOr(npcRow.schedule, {},),
        movementPattern: (scheduleData.movementPattern as string) ?? "stationary",
        movementTarget: (scheduleData.targetLocationId as string) ?? (scheduleData.followTargetId as string) ?? null,
      };
    }

    actors.push({
      id: p.id,
      displayName: p.display_name,
      actorType: p.actor_type,
      agentType: p.agent_type,
      systemPrompt: p.system_prompt,
      locationId: npcRow?.location_id ?? null,
      npcState,
    },);
  }

  const turnRows = await state.db
    .selectFrom("story_turns",)
    .selectAll()
    .where("chat_id", "=", chatId,)
    .where("status", "=", "accepted",)
    .orderBy("turn_number", "desc",)
    .limit(recentTurnCount,)
    .execute();

  const recentTurns = Array.from(turnRows.toReversed(), (t,) => ({
    turnNumber: t.turn_number,
    actorId: t.actor_id,
    turnType: t.turn_type,
    prompt: t.prompt_sent,
    response: t.response_received,
    qualityScore: t.quality_score,
  }),);

  const turnManagerState = chat.story_state
    ? jsonParseOr(chat.story_state, {
      currentTurn: 0,
      currentActorId: null,
      turnOrder: [],
      strategy: chat.turn_strategy ?? "hybrid",
      isPaused: false,
      lastTurnCompletedAt: null,
      pendingRegeneration: null,
    },)
    : {
      currentTurn: 0,
      currentActorId: null,
      turnOrder: [],
      strategy: chat.turn_strategy ?? "hybrid",
      isPaused: false,
      lastTurnCompletedAt: null,
      pendingRegeneration: null,
    };

  return {
    world: {
      id: world.id,
      name: world.name,
      lore: world.lore ?? "",
      currentLocation: {
        id: locId,
        name: locName,
        description: locationState?.description_override ?? "",
        atmosphere: locationState?.atmosphere ?? null,
        timeOfDay: locationState?.time_of_day ?? null,
        weather: locationState?.weather ?? null,
      },
    },
    activeQuests,
    actors,
    recentTurns,
    turnManagerState,
  };
}
