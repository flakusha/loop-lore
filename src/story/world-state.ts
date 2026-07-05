/**
 * World State Service
 *
 * Manage world state snapshots, NPC dynamic states, location
 * dynamic states, and the context assembly feed for the Game Master.
 */
import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import { uid, jsonParseOr } from "../utils";
import type { StoryContext, NpcState, LocationState, QuestConfig } from "./types";

// ── World State Service ──────────────────────────────────────

export class WorldStateService {
  constructor(private readonly db: Kysely<DB>) {}

  /**
   * Build the full StoryContext for the Game Master
   * from the current DB state.
   */
  async buildContext(chatId: string, recentTurnCount = 10): Promise<StoryContext | null> {
    const chat = await this.db
      .selectFrom("chats")
      .select(["world_id", "current_location_id", "story_state", "turn_strategy"])
      .where("id", "=", chatId)
      .executeTakeFirst();

    if (!chat?.world_id) return null;

    const world = await this.db
      .selectFrom("worlds")
      .selectAll()
      .where("id", "=", chat.world_id)
      .executeTakeFirst();

    if (!world) return null;

    let locationState: LocationState | null = null;
    let locName = "unknown";
    let locId = "";

    if (chat.current_location_id) {
      const loc = await this.db
        .selectFrom("locations")
        .select(["id", "name", "description"])
        .where("id", "=", chat.current_location_id)
        .executeTakeFirst();

      if (loc) {
        locId = loc.id;
        locName = loc.name;

        const ls = await this.db
          .selectFrom("location_states")
          .selectAll()
          .where("location_id", "=", chat.current_location_id)
          .executeTakeFirst();

        if (ls) {
          locationState = {
            description_override: ls.description_override,
            atmosphere: ls.atmosphere,
            npcs_present: jsonParseOr(ls.npcs_present, []),
            items_available: jsonParseOr(ls.items_available, []),
            time_of_day: ls.time_of_day,
            weather: ls.weather,
            hazards: jsonParseOr(ls.hazards, []),
          };
        }
      }
    }

    const questRows = await this.db
      .selectFrom("quests")
      .selectAll()
      .where("world_id", "=", world.id)
      .where("status", "=", "active")
      .orderBy("priority", "desc")
      .execute();

    const activeQuests = questRows.map((q) => ({
      id: q.id,
      name: q.name,
      type: q.type,
      progress: q.progress,
      target: q.target,
      config: jsonParseOr<QuestConfig>(q.config, {} as QuestConfig),
    }));

    const participantRows = await this.db
      .selectFrom("chat_participants")
      .innerJoin("actors", "actors.id", "chat_participants.actor_id")
      .select([
        "actors.id",
        "actors.display_name",
        "actors.actor_type",
        "actors.agent_type",
        "actors.system_prompt",
      ])
      .where("chat_participants.chat_id", "=", chatId)
      .execute();

    const actors: StoryContext["actors"] = [];
    for (const p of participantRows) {
      const npcRow =
        p.agent_type === "npc" || p.agent_type === "ai"
          ? await this.db.selectFrom("npc_states").selectAll().where("actor_id", "=", p.id).executeTakeFirst()
          : null;

      let npcState: NpcState | undefined;
      if (npcRow) {
        npcState = {
          health: npcRow.health,
          mental_state: npcRow.mental_state,
          knowledge: jsonParseOr(npcRow.knowledge, {}),
          relationships: jsonParseOr(npcRow.relationships, {}),
          inventory: jsonParseOr(npcRow.inventory, []),
          schedule: jsonParseOr(npcRow.schedule, {}),
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
      });
    }

    const turnRows = await this.db
      .selectFrom("story_turns")
      .selectAll()
      .where("chat_id", "=", chatId)
      .where("status", "=", "accepted")
      .orderBy("turn_number", "desc")
      .limit(recentTurnCount)
      .execute();

    const recentTurns = turnRows.toReversed().map((t) => ({
      turnNumber: t.turn_number,
      actorId: t.actor_id,
      turnType: t.turn_type,
      prompt: t.prompt_sent,
      response: t.response_received,
      qualityScore: t.quality_score,
    }));

    const turnManagerState = chat.story_state
      ? jsonParseOr(chat.story_state, {
          currentTurn: 0,
          currentActorId: null,
          turnOrder: [],
          strategy: chat.turn_strategy ?? "hybrid",
          isPaused: false,
          lastTurnCompletedAt: null,
          pendingRegeneration: null,
        })
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

  /** Initialize NPC dynamic states for all characters in a world */
  async initializeNpcStates(worldId: string): Promise<number> {
    const characters = await this.db
      .selectFrom("actors")
      .selectAll()
      .where("actor_type", "in", ["character", "narrator"] as never)
      .where("agent_type", "in", ["ai", "npc"] as never)
      .execute();

    let count = 0;
    for (const character of characters) {
      const existing = await this.db
        .selectFrom("npc_states")
        .select("id")
        .where("actor_id", "=", character.id)
        .where("world_id", "=", worldId)
        .executeTakeFirst();

      if (!existing) {
        await this.db
          .insertInto("npc_states")
          .values({
            id: uid(),
            actor_id: character.id,
            world_id: worldId,
            location_id: null,
            health: 100,
            mental_state: "neutral",
            inventory: "[]",
            relationships: "{}",
            knowledge: "{}",
            schedule: "{}",
          })
          .execute();
        count++;
      }
    }
    return count;
  }

  /** Initialize location dynamic states for all locations in a world */
  async initializeLocationStates(worldId: string): Promise<number> {
    const locations = await this.db
      .selectFrom("locations")
      .select("id")
      .where("world_id", "=", worldId)
      .execute();

    let count = 0;
    for (const loc of locations) {
      const existing = await this.db
        .selectFrom("location_states")
        .select("id")
        .where("location_id", "=", loc.id)
        .executeTakeFirst();

      if (!existing) {
        await this.db
          .insertInto("location_states")
          .values({
            id: uid(),
            location_id: loc.id,
            world_id: worldId,
            time_of_day: "morning",
            npcs_present: "[]",
            items_available: "[]",
            hazards: "[]",
          })
          .execute();
        count++;
      }
    }
    return count;
  }

  /** Take a state snapshot for rollback/history */
  async snapshot(
    worldId: string,
    turnId?: string,
    messageId?: string,
    description?: string,
  ): Promise<string> {
    const id = uid();
    await this.db
      .insertInto("world_states")
      .values({
        id,
        world_id: worldId,
        snapshot: "{}",
        trigger_message_id: messageId ?? null,
        trigger_turn_id: turnId ?? null,
        description: description ?? "Auto-snapshot",
      })
      .execute();
    return id;
  }

  /** Get NPC state for a given actor in a world */
  async getNpcState(actorId: string, worldId: string) {
    return this.db
      .selectFrom("npc_states")
      .selectAll()
      .where("actor_id", "=", actorId)
      .where("world_id", "=", worldId)
      .executeTakeFirst();
  }

  /** Get location state for a given location */
  async getLocationState(locationId: string) {
    return this.db
      .selectFrom("location_states")
      .selectAll()
      .where("location_id", "=", locationId)
      .executeTakeFirst();
  }

  /** Get all NPCs at a given location */
  async getNpcsAtLocation(locationId: string) {
    return this.db
      .selectFrom("npc_states")
      .innerJoin("actors", "actors.id", "npc_states.actor_id")
      .select([
        "npc_states.actor_id",
        "npc_states.health",
        "npc_states.mental_state",
        "actors.display_name",
        "actors.agent_type",
      ])
      .where("npc_states.location_id", "=", locationId)
      .execute();
  }
}
