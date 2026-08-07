/**
 * Chat transitions: migrate an online chat to a new template-bound chat.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { jsonStringifyOr, safeJsonParse, } from "../../utils";
import { getChatSetupTemplate, } from "./templates";
import type { MigrateChatParams, MigrateChatResult, } from "./types";

/**
 * Migrate a chat to a new chat bound to a different template, carrying over
 * continuity. This is the sanctioned path for changing key mechanics once a
 * chat is online (the source's mechanics are immutable in place).
 *
 * Creates a new chat with `parent_chat_id = sourceChatId`, seeded from the new
 * template's key mechanics, optionally copying participants, memory, and
 * history. The source chat is left intact as a read-only branch.
 *
 * Idempotency: a source chat may only be migrated once — a second call returns
 * `bad_request` with a pointer to the existing migrated chat.
 *
 * @returns { ok: true, newChatId, sourceChatId } on success, or ServiceError
 */
export async function migrateChat(
  database: Kysely<DB>,
  chatId: string,
  params: MigrateChatParams,
): Promise<MigrateChatResult> {
  const source = await database
    .selectFrom("chats",)
    .selectAll()
    .where("id", "=", chatId,)
    .executeTakeFirst();

  if (!source) {
    return { code: "not_found", message: "Chat not found", };
  }

  // Ownership guard
  if (source.created_by !== params.createdBy) {
    return { code: "forbidden", message: "You do not own this chat", };
  }

  // Idempotency: reject if this source already migrated
  const existing = await database
    .selectFrom("chats",)
    .select("id",)
    .where("parent_chat_id", "=", chatId,)
    .executeTakeFirst();
  if (existing) {
    return { code: "bad_request", message: "This chat has already been migrated", };
  }

  const template = await getChatSetupTemplate(database, params.templateId,);
  if (!template) {
    return { code: "bad_request", message: "Template not found", };
  }

  const newChatId = crypto.randomUUID();
  const gmConfig = template.gm_config
    ? safeJsonParse<Record<string, unknown>>(template.gm_config,)
    : { ok: false as const, value: null, };

  await database
    .insertInto("chats",)
    .values({
      id: newChatId,
      name: params.name ?? `${source.name} (migrated)`,
      type: source.type,
      mode: (template.mode as never) ?? source.mode,
      created_by: params.createdBy,
      world_id: template.world_id ?? source.world_id,
      current_location_id: source.current_location_id,
      turn_strategy: (template.turn_strategy as never) ?? source.turn_strategy,
      gm_config: gmConfig.ok && gmConfig.value ? jsonStringifyOr(gmConfig.value,) : null,
      visual_novel: template.visual_novel,
      parent_chat_id: chatId,
      template_id: template.id,
    },)
    .execute();

  // Carry participants
  if (params.carry?.participants !== false) {
    const participants = await database
      .selectFrom("chat_participants",)
      .selectAll()
      .where("chat_id", "=", chatId,)
      .execute();
    for (const p of participants) {
      await database
        .insertInto("chat_participants",)
        .values({
          chat_id: newChatId,
          actor_id: p.actor_id,
          role_in_chat: p.role_in_chat,
          persona_id: p.persona_id,
          impersonate_actor_id: p.impersonate_actor_id,
        },)
        .execute();
    }
  }

  // Carry memory (actor_memories whose source_chat_id points at this chat)
  if (params.carry?.memory === true) {
    const memories = await database
      .selectFrom("actor_memories",)
      .selectAll()
      .where("source_chat_id", "=", chatId,)
      .execute();
    for (const m of memories) {
      await database
        .insertInto("actor_memories",)
        .values({
          id: crypto.randomUUID(),
          actor_id: m.actor_id,
          source_chat_id: newChatId,
          memory_type: m.memory_type,
          content: m.content,
          importance: m.importance,
          last_accessed_at: m.last_accessed_at,
          created_at: m.created_at,
          source_message_id: m.source_message_id,
          context: m.context,
          world_id: m.world_id,
          user_id: m.user_id,
        },)
        .execute();
    }
  }

  // Carry full history (message tree, preserving swipes)
  if (params.carry?.history === "full") {
    const messages = await database
      .selectFrom("messages",)
      .selectAll()
      .where("chat_id", "=", chatId,)
      .orderBy("created_at", "asc",)
      .execute();
    for (const m of messages) {
      await database
        .insertInto("messages",)
        .values({
          id: crypto.randomUUID(),
          chat_id: newChatId,
          actor_id: m.actor_id,
          parent_id: m.parent_id,
          role: m.role,
          content: m.content,
          key_id: m.key_id,
          content_type: m.content_type,
          content_format: m.content_format,
          content_encoding: m.content_encoding,
          status: m.status,
          visibility: m.visibility,
          swipe_index: m.swipe_index,
          created_at: m.created_at,
          edited_at: m.edited_at,
          attachments: m.attachments,
          archived_at: m.archived_at,
        },)
        .execute();
    }
    // Note: parent_id remapping for the tree is not performed here — the
    // active-leaf flatten (see swipe/replay design) treats migrated history as
    // a flat branch. Full tree remap is a follow-up.
  }

  // Carry party/game state: story_turns, quest_progress, group_initiatives.
  // These are chat-scoped so they re-point cleanly to the migrated chat.
  if (params.carry?.state === true) {
    const turns = await database
      .selectFrom("story_turns",)
      .selectAll()
      .where("chat_id", "=", chatId,)
      .execute();
    for (const t of turns) {
      await database
        .insertInto("story_turns",)
        .values({
          id: crypto.randomUUID(),
          chat_id: newChatId,
          turn_number: t.turn_number,
          actor_id: t.actor_id,
          turn_type: t.turn_type,
          prompt_sent: t.prompt_sent,
          response_received: t.response_received,
          quality_score: t.quality_score,
          quality_details: t.quality_details,
          regeneration_count: t.regeneration_count,
          status: t.status,
          gm_decision: t.gm_decision,
          world_events: t.world_events,
          quest_progress: t.quest_progress,
          started_at: t.started_at,
          completed_at: t.completed_at,
          created_at: t.created_at,
          updated_at: t.updated_at,
        },)
        .execute();
    }

    const quests = await database
      .selectFrom("quest_progress",)
      .selectAll()
      .where("chat_id", "=", chatId,)
      .execute();
    for (const q of quests) {
      await database
        .insertInto("quest_progress",)
        .values({
          id: crypto.randomUUID(),
          quest_id: q.quest_id,
          chat_id: newChatId,
          progress: q.progress,
          status: q.status,
          contributed_events: q.contributed_events,
          started_at: q.started_at,
          created_at: q.created_at,
          updated_at: q.updated_at,
          completed_at: q.completed_at,
        },)
        .execute();
    }

    const initiatives = await database
      .selectFrom("group_initiatives",)
      .selectAll()
      .where("chat_id", "=", chatId,)
      .execute();
    for (const i of initiatives) {
      await database
        .insertInto("group_initiatives",)
        .values({
          chat_id: newChatId,
          scene_id: i.scene_id,
          actor_id: i.actor_id,
          score: i.score,
          created_at: i.created_at,
          updated_at: i.updated_at,
        },)
        .execute();
    }
  }

  // Carry chat pins + VN choice history.
  if (params.carry?.pins === true) {
    const pins = await database
      .selectFrom("chat_pins",)
      .selectAll()
      .where("chat_id", "=", chatId,)
      .execute();
    for (const p of pins) {
      await database
        .insertInto("chat_pins",)
        .values({
          id: crypto.randomUUID(),
          chat_id: newChatId,
          message_id: p.message_id,
          pinned_by: p.pinned_by,
          pinned_at: p.pinned_at,
        },)
        .execute();
    }

    const choices = await database
      .selectFrom("vn_choices",)
      .selectAll()
      .where("chat_id", "=", chatId,)
      .execute();
    for (const c of choices) {
      await database
        .insertInto("vn_choices",)
        .values({
          id: crypto.randomUUID(),
          chat_id: newChatId,
          scene_index: c.scene_index,
          label: c.label,
          description: c.description,
          consequences: c.consequences,
          relationship_impact: c.relationship_impact,
          mood_impact: c.mood_impact,
          unlock_conditions: c.unlock_conditions,
          selected: c.selected,
          selected_at: c.selected_at,
          created_at: c.created_at,
        },)
        .execute();
    }
  }

  // Carry world/npc/location state snapshots for the party's world.
  // These are world-scoped (not chat-scoped); when migrating to a template in
  // the same world they are already shared, so this only copies them when the
  // new chat's world differs from the source's.
  if (params.carry?.worldState === true && template.world_id && template.world_id !== source.world_id) {
    const worldId = template.world_id;
    const states = await database
      .selectFrom("world_states",)
      .selectAll()
      .where("world_id", "=", source.world_id ?? "",)
      .execute();
    for (const s of states) {
      await database
        .insertInto("world_states",)
        .values({
          id: crypto.randomUUID(),
          world_id: worldId,
          snapshot: s.snapshot,
          trigger_message_id: s.trigger_message_id,
          trigger_turn_id: s.trigger_turn_id,
          description: s.description,
          created_at: s.created_at,
        },)
        .execute();
    }

    const npcStates = await database
      .selectFrom("npc_states",)
      .selectAll()
      .where("world_id", "=", source.world_id ?? "",)
      .execute();
    for (const n of npcStates) {
      await database
        .insertInto("npc_states",)
        .values({
          id: crypto.randomUUID(),
          actor_id: n.actor_id,
          world_id: worldId,
          location_id: n.location_id,
          health: n.health,
          mental_state: n.mental_state,
          knowledge: n.knowledge,
          relationships: n.relationships,
          inventory: n.inventory,
          schedule: n.schedule,
          created_at: n.created_at,
          updated_at: n.updated_at,
        },)
        .execute();
    }

    const locationStates = await database
      .selectFrom("location_states",)
      .selectAll()
      .where("world_id", "=", source.world_id ?? "",)
      .execute();
    for (const l of locationStates) {
      await database
        .insertInto("location_states",)
        .values({
          id: crypto.randomUUID(),
          location_id: l.location_id,
          world_id: worldId,
          description_override: l.description_override,
          atmosphere: l.atmosphere,
          npcs_present: l.npcs_present,
          items_available: l.items_available,
          time_of_day: l.time_of_day,
          weather: l.weather,
          hazards: l.hazards,
          created_at: l.created_at,
          updated_at: l.updated_at,
        },)
        .execute();
    }
  }

  return { ok: true, newChatId, sourceChatId: chatId, };
}
