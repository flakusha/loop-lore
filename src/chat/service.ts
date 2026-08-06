/**
 * Chat Service Layer
 *
 * Business logic between routes and database.
 * Routes call these functions; this module calls Kysely.
 *
 * No HTTP concerns — no Request/Response, no Elysia context.
 * Errors are thrown as ServiceError objects; routes map to HTTP.
 */
import type { Kysely, } from "kysely";
import {
  MessageStatus,
  MessageVisibility,
  PinnedState,
} from "../db/enums";
import type { DB, } from "../db/schema";
import { jsonStringifyOr, safeJsonParse, safeJsonStringify, } from "../utils";
import { computeContextWindow, } from "./context-window";
import { resolveResponseLength, } from "./response-length";
import { estimateTokens, } from "./token-utils";
import type { ResponseLengthPreset, } from "./types";
import { resolveFeatureFlags, } from "./types";
import type { ContextWindow, ModeFeatureFlags, ResponseLengthConfig, } from "./types";

// ─── Error Type ───────────────────────────────────────────────

export interface ServiceError {
  code: "not_found" | "forbidden" | "bad_request";
  message: string;
}

/** Structured error for key-mechanic mutation on an online chat (maps to 409). */
export interface KeyMechanicConflictError {
  code: "key_mechanic_conflict";
  message: string;
  details: {
    fields: string[];
    migrateEndpoint: string;
  };
}

export type UpdateChatResult = ServiceError | KeyMechanicConflictError | { ok: true };

// ─── Chat Access ──────────────────────────────────────────────

/**
 * Check if a user owns or is a participant of a chat.
 *
 * @returns { ok: true } if access granted, or { ok: false, error } with reason
 */
export async function checkChatAccess(
  database: Kysely<DB>,
  chatId: string,
  userId: string,
  userRole: string | null | undefined,
): Promise<{ ok: true } | { ok: false; error: ServiceError }> {
  const chat = await database
    .selectFrom("chats",)
    .select("created_by",)
    .where("id", "=", chatId,)
    .executeTakeFirst();

  if (!chat) {
    return { ok: false, error: { code: "not_found", message: "Chat not found", }, };
  }

  if (chat.created_by === userId || userRole === "admin" || userRole === "solo") {
    return { ok: true, };
  }

  const participant = await database
    .selectFrom("chat_participants",)
    .select("actor_id",)
    .where("chat_id", "=", chatId,)
    .where("actor_id", "=", userId,)
    .executeTakeFirst();

  if (!participant) {
    return { ok: false, error: { code: "not_found", message: "Chat not found", }, };
  }

  return { ok: true, };
}

// ─── Key Mechanics vs Session State ───────────────────────────

/**
 * Names of the key-mechanic update params that are immutable once a chat is
 * online. Changing these requires migrating to a new chat bound to a different
 * template (see `migrateChat`).
 *
 * Mirrors .plan/design/chat-template-config-lifecycle.md §3.1.
 */
export const KEY_MECHANIC_PARAMS = [
  "mode",
  "turnStrategy",
  "worldId",
  "gmConfig",
  "visualNovel",
] as const;

export type KeyMechanicParam = (typeof KEY_MECHANIC_PARAMS)[number];

/**
 * Determine whether a chat is "online" — i.e. has at least one confirmed
 * message. Before that it is a draft and key mechanics remain editable.
 */
export async function isChatOnline(
  database: Kysely<DB>,
  chatId: string,
): Promise<boolean> {
  const row = await database
    .selectFrom("messages",)
    .select("id",)
    .where("chat_id", "=", chatId,)
    .where("status", "=", "confirmed",)
    .limit(1,)
    .executeTakeFirst();
  return row !== undefined;
}

// ─── Chat CRUD ────────────────────────────────────────────────

export interface CreateChatParams {
  name: string;
  type?: string;
  mode?: string;
  createdBy: string;
  worldId?: string | null;
  currentLocationId?: string | null;
  turnStrategy?: string | null;
  participantIds?: string[];
  gmConfig?: Record<string, unknown> | null;
  visualNovel?: boolean;
  templateId?: string;
  /** Seed the new chat with participant memories: "full" | "selective" | "fresh". */
  memoryCarry?: "full" | "selective" | "fresh";
  /** Actor memory ids to carry when memoryCarry === "selective". */
  memoryCarryIds?: string[];
}

/**
 * Create a new chat with owner and optional participants.
 *
 * @returns The new chat ID
 */
export async function createChat(
  database: Kysely<DB>,
  params: CreateChatParams,
): Promise<string> {
  const newChatId = crypto.randomUUID();

  await database
    .insertInto("chats",)
    .values({
      id: newChatId,
      name: params.name,
      type: (params.type as never) ?? "direct",
      mode: (params.mode as never) ?? "direct",
      created_by: params.createdBy,
      world_id: params.worldId ?? null,
      current_location_id: params.currentLocationId ?? null,
      turn_strategy: (params.turnStrategy as never) ?? null,
      gm_config: params.gmConfig ? jsonStringifyOr(params.gmConfig,) : null,
      visual_novel: params.visualNovel ? 1 : 0,
      template_id: params.templateId ?? null,
    },)
    .execute();

  // Add owner
  await database
    .insertInto("chat_participants",)
    .values({ chat_id: newChatId, actor_id: params.createdBy, role_in_chat: "owner", },)
    .execute();

  // Add additional participants
  if (params.participantIds && params.participantIds.length > 0) {
    for (const actorId of params.participantIds) {
      try {
        await database
          .insertInto("chat_participants",)
          .values({ chat_id: newChatId, actor_id: actorId, role_in_chat: "member", },)
          .execute();
      } catch {
        /* skip duplicate */
      }
    }
  }

  // Carry participant memories into the new chat. Mirrors the migrateChat
  // semantic: duplicate the selected source memories with source_chat_id set
  // to the new chat so the injected context is scoped to this chat.
  if (params.memoryCarry && params.memoryCarry !== "fresh" && params.participantIds?.[0]) {
    const sourceActorId = params.participantIds[0];
    const selectiveIds = params.memoryCarry === "selective" && params.memoryCarryIds?.length
      ? params.memoryCarryIds
      : undefined;
    const selections = await database
      .selectFrom("actor_memories",)
      .select([
        "id",
        "actor_id",
        "source_chat_id",
        "memory_type",
        "content",
        "importance",
        "last_accessed_at",
        "created_at",
        "source_message_id",
        "context",
        "world_id",
        "user_id",
      ],)
      .where("actor_id", "=", sourceActorId,)
      .$if(!!selectiveIds?.length, (qb,) => qb.where("id", "in", selectiveIds as string[],),)
      .execute();
    for (const m of selections) {
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

  return newChatId;
}

// ─── Chat Setup Templates ────────────────────────────────────

export interface ChatSetupTemplate {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  mode: string | null;
  turn_strategy: string | null;
  world_id: string | null;
  gm_config: string | null;
  visual_novel: number;
}

/**
 * List all chat setup templates.
 */
export async function listChatSetupTemplates(
  database: Kysely<DB>,
): Promise<ChatSetupTemplate[]> {
  return await database
    .selectFrom("chat_setup_templates",)
    .selectAll()
    .orderBy("name", "asc",)
    .execute();
}

/**
 * Resolve a chat setup template by id or slug.
 */
export async function getChatSetupTemplate(
  database: Kysely<DB>,
  templateId: string,
): Promise<ChatSetupTemplate | null> {
  const row = await database
    .selectFrom("chat_setup_templates",)
    .selectAll()
    .where((eb,) => eb.or([eb("id", "=", templateId,), eb("slug", "=", templateId,),],))
    .executeTakeFirst();
  return (row as unknown as ChatSetupTemplate | undefined) ?? null;
}

/**
 * Built-in starter templates, seeded only when the table is empty so existing
 * deployments (and any admin-created templates) are never clobbered.
 */
export const CHAT_SETUP_TEMPLATE_DEFAULTS: {
  id: string;
  slug: string;
  name: string;
  description: string;
  mode: string;
  turn_strategy: string;
  visual_novel: number;
}[] = [
  {
    id: "template-simple-direct",
    slug: "simple-direct",
    name: "Simple 1:1 Chat",
    description: "A lightweight direct chat with a single character, round-robin turns.",
    mode: "direct",
    turn_strategy: "round_robin",
    visual_novel: 0,
  },
  {
    id: "template-roleplay",
    slug: "advanced-roleplay",
    name: "Advanced 1:1 Roleplay",
    description: "Story-driven 1:1 roleplay with scene-based narration.",
    mode: "story",
    turn_strategy: "scene_based",
    visual_novel: 0,
  },
  {
    id: "template-group-gm",
    slug: "group-gm",
    name: "Group + GM",
    description: "A group chat with a game-master driver and round-robin turns.",
    mode: "group",
    turn_strategy: "round_robin",
    visual_novel: 0,
  },
  {
    id: "template-brainstorm",
    slug: "brainstorm-assistant",
    name: "Brainstorm Assistant",
    description: "A direct chat for ideation and working through a topic.",
    mode: "direct",
    turn_strategy: "round_robin",
    visual_novel: 0,
  },
  {
    id: "template-visual-novel",
    slug: "visual-novel",
    name: "Visual Novel",
    description: "Story mode with the visual-novel overlay enabled for choice cards.",
    mode: "story",
    turn_strategy: "scene_based",
    visual_novel: 1,
  },
];

/**
 * Seed built-in chat setup templates if none exist. Idempotent; never overwrites
 * or duplicates templates. Safe to call at server boot and in tests.
 *
 * @returns The number of templates created.
 */
export async function seedChatSetupTemplates(database: Kysely<DB>,): Promise<number> {
  const existing = await database
    .selectFrom("chat_setup_templates",)
    .select("id",)
    .limit(1,)
    .executeTakeFirst();
  if (existing) { return 0; }

  let created = 0;
  for (const t of CHAT_SETUP_TEMPLATE_DEFAULTS) {
    await database
      .insertInto("chat_setup_templates",)
      .values({
        id: t.id,
        slug: t.slug,
        name: t.name,
        description: t.description,
        mode: t.mode,
        turn_strategy: t.turn_strategy,
        visual_novel: t.visual_novel,
      },)
      .execute();
    created++;
  }
  return created;
}

/**
 * Create a chat setup template (admin).
 */
export type TemplateMutationResult =
  | { ok: true; template: ChatSetupTemplate }
  | { ok: false; code: "conflict" | "not_found" | "bad_request"; message: string };

export async function createChatSetupTemplate(
  database: Kysely<DB>,
  params: {
    slug: string;
    name: string;
    description?: string | null;
    mode?: string | null;
    turnStrategy?: string | null;
    worldId?: string | null;
    gmConfig?: Record<string, unknown> | null;
    visualNovel?: boolean;
  },
): Promise<TemplateMutationResult> {
  const slugExists = await database
    .selectFrom("chat_setup_templates",)
    .select("id",)
    .where("slug", "=", params.slug,)
    .executeTakeFirst();
  if (slugExists) {
    return { ok: false, code: "conflict", message: "Template slug already exists", };
  }

  const id = `template-${params.slug}`;
  await database
    .insertInto("chat_setup_templates",)
    .values({
      id,
      slug: params.slug,
      name: params.name,
      description: params.description ?? null,
      mode: params.mode ?? null,
      turn_strategy: params.turnStrategy ?? null,
      world_id: params.worldId ?? null,
      gm_config: params.gmConfig ? jsonStringifyOr(params.gmConfig,) : null,
      visual_novel: params.visualNovel ? 1 : 0,
    },)
    .execute();
  const created = await getChatSetupTemplate(database, id,);
  if (!created) {
    return { ok: false, code: "bad_request", message: "Failed to create template", };
  }
  return { ok: true, template: created, };
}

/**
 * Update a chat setup template (admin). Existing bound chats keep their snapshot
 * binding — templates are snapshots, edits apply to future chats only.
 */
export async function updateChatSetupTemplate(
  database: Kysely<DB>,
  templateId: string,
  params: {
    name?: string;
    description?: string | null;
    mode?: string | null;
    turnStrategy?: string | null;
    worldId?: string | null;
    gmConfig?: Record<string, unknown> | null;
    visualNovel?: boolean;
  },
): Promise<TemplateMutationResult> {
  const existing = await getChatSetupTemplate(database, templateId,);
  if (!existing) {
    return { ok: false, code: "not_found", message: "Template not found", };
  }

  const updates: Record<string, unknown> = {};
  if (params.name !== undefined) { updates.name = params.name; }
  if (params.description !== undefined) { updates.description = params.description; }
  if (params.mode !== undefined) { updates.mode = params.mode; }
  if (params.turnStrategy !== undefined) { updates.turn_strategy = params.turnStrategy; }
  if (params.worldId !== undefined) { updates.world_id = params.worldId; }
  if (params.gmConfig !== undefined) {
    updates.gm_config = params.gmConfig ? jsonStringifyOr(params.gmConfig,) : null;
  }
  if (params.visualNovel !== undefined) { updates.visual_novel = params.visualNovel ? 1 : 0; }
  updates.updated_at = new Date().toISOString();

  await database
    .updateTable("chat_setup_templates",)
    .set(updates,)
    .where("id", "=", existing.id,)
    .execute();
  const updated = await getChatSetupTemplate(database, existing.id,);
  if (!updated) {
    return { ok: false, code: "bad_request", message: "Failed to update template", };
  }
  return { ok: true, template: updated, };
}

/**
 * Delete a chat setup template (admin). Chats bound to it keep their snapshot
 * (template_id set null via FK onDelete set null).
 */
export async function deleteChatSetupTemplate(
  database: Kysely<DB>,
  templateId: string,
): Promise<TemplateMutationResult> {
  const existing = await getChatSetupTemplate(database, templateId,);
  if (!existing) {
    return { ok: false, code: "not_found", message: "Template not found", };
  }
  await database
    .deleteFrom("chat_setup_templates",)
    .where("id", "=", existing.id,)
    .execute();
  return { ok: true, template: existing, };
}

export interface MigrateChatParams {
  templateId: string;
  createdBy: string;
  name?: string;
  carry?: {
    participants?: boolean;
    memory?: boolean;
    history?: "none" | "summary" | "full";
    /** Carry party/game state: story_turns, quest_progress, group_initiatives. */
    state?: boolean;
    /** Carry chat pins + VN choice history. */
    pins?: boolean;
    /** Carry world/npc/location state snapshots for the party's world. */
    worldState?: boolean;
  };
}

export type MigrateChatResult =
  | ServiceError
  | { ok: true; newChatId: string; sourceChatId: string };

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

/**
 * Get a chat with its participants.
 */
export async function getChat(
  database: Kysely<DB>,
  chatId: string,
): Promise<{ chat: Record<string, unknown>; participants: Record<string, unknown>[] } | null> {
  const chatData = await database
    .selectFrom("chats",)
    .selectAll()
    .where("id", "=", chatId,)
    .executeTakeFirst();

  if (!chatData) { return null; }

  const participants = await database
    .selectFrom("chat_participants",)
    .selectAll()
    .where("chat_id", "=", chatId,)
    .execute();

  return {
    chat: chatData as unknown as Record<string, unknown>,
    participants: participants as unknown as Record<string, unknown>[],
  };
}

export interface UpdateChatParams {
  name?: string;
  mode?: string;
  turnStrategy?: string | null;
  worldId?: string | null;
  isPinned?: boolean;
  isPaused?: boolean;
  freezePanel?: boolean;
  userRole?: string | null;
  gmConfig?: Record<string, unknown> | null;
  visualNovel?: boolean;
}

/**
 * Update chat settings.
 *
 * Enforces the online-chat configuration policy: key mechanics (`mode`,
 * `turnStrategy`, `worldId`, `gmConfig`, `visualNovel`) are immutable once the
 * chat is online. Attempting to mutate them returns a `key_mechanic_conflict`
 * error pointing to the migration endpoint. Session-state fields (`name`,
 * `isPinned`, `isPaused`, `freezePanel`) pass through.
 *
 * @returns ServiceError | KeyMechanicConflictError on failure, or { ok: true } on success
 */
export async function updateChat(
  database: Kysely<DB>,
  chatId: string,
  params: UpdateChatParams,
): Promise<UpdateChatResult> {
  const fullChat = await database
    .selectFrom("chats",)
    .selectAll()
    .where("id", "=", chatId,)
    .executeTakeFirst();

  if (!fullChat) {
    return { code: "not_found", message: "Chat not found", };
  }

  // Check panel freeze
  if (fullChat.story_state) {
    const storyState = safeJsonParse<Record<string, unknown>>(fullChat.story_state,);
    if (storyState.ok && storyState.value.isPanelFrozen && params.userRole !== "admin") {
      return { code: "forbidden", message: "Chat settings are frozen by admin", };
    }
  }

  // Enforce key-mechanic immutability once online
  const attemptedMechanics = KEY_MECHANIC_PARAMS.filter((field,) => params[field] !== undefined);
  if (attemptedMechanics.length > 0 && (await isChatOnline(database, chatId,))) {
    return {
      code: "key_mechanic_conflict",
      message:
        "This chat is online and its key mechanics are locked. To change mode, turn strategy, world, GM config, or visual novel, migrate to a new chat.",
      details: {
        fields: [...attemptedMechanics,],
        migrateEndpoint: `/api/chats/${chatId}/migrate`,
      },
    };
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString(), };
  if (params.name) { updates.name = params.name; }
  if (params.mode) { updates.mode = params.mode; }
  if (params.turnStrategy !== undefined) { updates.turn_strategy = params.turnStrategy; }
  if (params.worldId !== undefined) { updates.world_id = params.worldId; }
  if (typeof params.isPinned === "boolean") {
    updates.is_pinned = params.isPinned ? PinnedState.Pinned : PinnedState.Unpinned;
  }
  if (typeof params.isPaused === "boolean") {
    const current = fullChat.story_state
      ? safeJsonParse<Record<string, unknown>>(fullChat.story_state,)
      : null;
    const state = { ...(current?.ok && current.value), isPaused: params.isPaused, };
    const serialized = safeJsonStringify(state,);
    updates.story_state = serialized.ok ? serialized.value : fullChat.story_state;
  }
  if (typeof params.freezePanel === "boolean" && params.userRole === "admin") {
    const current = fullChat.story_state
      ? safeJsonParse<Record<string, unknown>>(fullChat.story_state,)
      : null;
    const state = { ...(current?.ok && current.value), isPanelFrozen: params.freezePanel, };
    const serialized = safeJsonStringify(state,);
    updates.story_state = serialized.ok ? serialized.value : fullChat.story_state;
  }
  if (params.gmConfig !== undefined) {
    updates.gm_config = params.gmConfig ? jsonStringifyOr(params.gmConfig,) : null;
  }
  if (typeof params.visualNovel === "boolean") {
    updates.visual_novel = params.visualNovel ? 1 : 0;
  }

  await database.updateTable("chats",).set(updates,).where("id", "=", chatId,).execute();
  return { ok: true, };
}

/**
 * Delete a chat and all its related data (cascade).
 */
export async function deleteChat(
  database: Kysely<DB>,
  chatId: string,
): Promise<void> {
  await database.deleteFrom("generation_attempts",).where("chat_id", "=", chatId,).execute();
  await database
    .deleteFrom("world_states",)
    .where((eb,) =>
      eb.or([
        eb(
          "trigger_message_id",
          "in",
          database.selectFrom("messages",).select("id",).where("chat_id", "=", chatId,),
        ),
        eb(
          "trigger_turn_id",
          "in",
          database.selectFrom("story_turns",).select("id",).where("chat_id", "=", chatId,),
        ),
      ],)
    )
    .execute();
  await database.deleteFrom("story_turns",).where("chat_id", "=", chatId,).execute();
  await database.deleteFrom("quest_progress",).where("chat_id", "=", chatId,).execute();
  await database.deleteFrom("synthetic_data",).where("chat_id", "=", chatId,).execute();
  await database.deleteFrom("actor_memories",).where("source_chat_id", "=", chatId,).execute();
  await database
    .deleteFrom("asset_links",)
    .where("entity_type", "=", "chat",)
    .where("entity_id", "=", chatId,)
    .execute();
  await database.deleteFrom("messages",).where("chat_id", "=", chatId,).execute();
  await database.deleteFrom("chat_participants",).where("chat_id", "=", chatId,).execute();
  await database.deleteFrom("chats",).where("id", "=", chatId,).execute();
}

/**
 * Batch archive chats owned by a user.
 *
 * @returns IDs of archived chats
 */
export async function batchArchiveChats(
  database: Kysely<DB>,
  chatIds: string[],
  userId: string,
): Promise<string[]> {
  const owned = await database
    .selectFrom("chats",)
    .select("id",)
    .where("id", "in", chatIds,)
    .where("created_by", "=", userId,)
    .execute();
  const ownedIds = owned.map((c,) => c.id);
  if (ownedIds.length === 0) { return []; }

  await database
    .updateTable("chats",)
    .set({ is_pinned: "archived", updated_at: new Date().toISOString(), },)
    .where("id", "in", ownedIds,)
    .execute();

  return ownedIds;
}

/**
 * Batch delete chats owned by a user.
 *
 * @returns Number of deleted chats
 */
export async function batchDeleteChats(
  database: Kysely<DB>,
  chatIds: string[],
  userId: string,
): Promise<number> {
  const owned = await database
    .selectFrom("chats",)
    .select("id",)
    .where("id", "in", chatIds,)
    .where("created_by", "=", userId,)
    .execute();
  const ownedIds = owned.map((c,) => c.id);
  if (ownedIds.length === 0) { return 0; }

  for (const chatId of ownedIds) {
    await database.deleteFrom("generation_attempts",).where("chat_id", "=", chatId,).execute();
    await database.deleteFrom("messages",).where("chat_id", "=", chatId,).execute();
    await database.deleteFrom("chat_participants",).where("chat_id", "=", chatId,).execute();
    await database.deleteFrom("story_turns",).where("chat_id", "=", chatId,).execute();
    await database.deleteFrom("quest_progress",).where("chat_id", "=", chatId,).execute();
    await database.deleteFrom("synthetic_data",).where("chat_id", "=", chatId,).execute();
    await database.deleteFrom("actor_memories",).where("source_chat_id", "=", chatId,).execute();
  }
  await database.deleteFrom("chats",).where("id", "in", ownedIds,).execute();
  return ownedIds.length;
}

/**
 * Batch export chats with messages, participants, and actors.
 */
export async function batchExportChats(
  database: Kysely<DB>,
  chatIds: string[],
  userId: string,
): Promise<Record<string, unknown>[] | null> {
  const owned = await database
    .selectFrom("chats",)
    .selectAll()
    .where("id", "in", chatIds,)
    .where("created_by", "=", userId,)
    .execute();

  if (owned.length === 0) { return null; }

  return Promise.all(
    owned.map(async (chat,) => {
      const messages = await database
        .selectFrom("messages",)
        .selectAll()
        .where("chat_id", "=", chat.id,)
        .orderBy("created_at", "asc",)
        .execute();
      const participants = await database
        .selectFrom("chat_participants",)
        .selectAll()
        .where("chat_id", "=", chat.id,)
        .execute();
      return { chat, messages, participants, };
    },),
  );
}

// ─── Chat Participants ────────────────────────────────────────

/**
 * Add a participant to a chat.
 */
export async function addParticipant(
  database: Kysely<DB>,
  chatId: string,
  actorId: string,
  role = "member",
): Promise<void> {
  try {
    await database
      .insertInto("chat_participants",)
      .values({ chat_id: chatId, actor_id: actorId, role_in_chat: role as never, },)
      .execute();
  } catch {
    /* skip duplicate */
  }
}

/**
 * Update a participant's settings.
 */
export async function updateParticipant(
  database: Kysely<DB>,
  chatId: string,
  actorId: string,
  updates: { talkativity?: number; initiative?: number; role?: string },
): Promise<ServiceError | { ok: true }> {
  const fields: Record<string, unknown> = {};
  if (typeof updates.talkativity === "number") {
    fields.talkativity = Math.min(10, Math.max(1, updates.talkativity,),);
  }
  if (typeof updates.initiative === "number") { fields.initiative = updates.initiative; }
  if (typeof updates.role === "string") { fields.role_in_chat = updates.role; }

  if (Object.keys(fields,).length === 0) {
    return { code: "bad_request", message: "No valid fields to update", };
  }

  await database
    .updateTable("chat_participants",)
    .set(fields,)
    .where("chat_id", "=", chatId,)
    .where("actor_id", "=", actorId,)
    .execute();

  return { ok: true, };
}

/**
 * Remove a participant from a chat.
 */
export async function removeParticipant(
  database: Kysely<DB>,
  chatId: string,
  actorId: string,
): Promise<void> {
  await database
    .deleteFrom("chat_participants",)
    .where("chat_id", "=", chatId,)
    .where("actor_id", "=", actorId,)
    .execute();
}

/**
 * Update chat location.
 */
export async function updateChatLocation(
  database: Kysely<DB>,
  chatId: string,
  locationId: string | null,
): Promise<ServiceError | { ok: true; locationId: string | null; locationName?: string }> {
  const fullChat = await database
    .selectFrom("chats",)
    .selectAll()
    .where("id", "=", chatId,)
    .executeTakeFirst();

  if (!fullChat) {
    return { code: "not_found", message: "Chat not found", };
  }

  if (!fullChat.world_id) {
    return { code: "bad_request", message: "Chat has no world assigned", };
  }

  if (locationId === null) {
    await database
      .updateTable("chats",)
      .set({ current_location_id: null, updated_at: new Date().toISOString(), },)
      .where("id", "=", chatId,)
      .execute();
    return { ok: true, locationId: null, };
  }

  const location = await database
    .selectFrom("locations",)
    .select(["id", "name",],)
    .where("id", "=", locationId,)
    .where("world_id", "=", fullChat.world_id,)
    .executeTakeFirst();

  if (!location) {
    return { code: "not_found", message: "Location not found in this world", };
  }

  await database
    .updateTable("chats",)
    .set({ current_location_id: locationId, updated_at: new Date().toISOString(), },)
    .where("id", "=", chatId,)
    .execute();

  return { ok: true, locationId, locationName: location.name, };
}

/**
 * Update user persona for a chat.
 */
export async function updateUserPersona(
  database: Kysely<DB>,
  chatId: string,
  userId: string,
  personaId: string | null,
): Promise<void> {
  await database
    .updateTable("chat_participants",)
    .set({ persona_id: personaId, },)
    .where("chat_id", "=", chatId,)
    .where("actor_id", "=", userId,)
    .execute();
}

/**
 * Update impersonation actor for a chat.
 *
 * Enforces 1-per-world constraint: when setting an impersonate_actor_id,
 * checks if that actor is already being impersonated by another user in
 * a chat belonging to the same world. Private/disconnected chats exempt.
 *
 * @returns ServiceError if constraint violated, or void on success
 */
export async function updateImpersonation(
  database: Kysely<DB>,
  chatId: string,
  userId: string,
  impersonateActorId: string | null,
): Promise<ServiceError | undefined> {
  if (impersonateActorId) {
    // Look up this chat's world_id
    const chat = await database
      .selectFrom("chats",)
      .select(["world_id", "type",],)
      .where("id", "=", chatId,)
      .executeTakeFirst();

    if (chat?.world_id) {
      // Check if another user already impersonates this actor in the same world
      const conflict = await database
        .selectFrom("chat_participants",)
        .innerJoin("chats", "chats.id", "chat_participants.chat_id",)
        .select(["chat_participants.actor_id", "chat_participants.chat_id",],)
        .where("chats.world_id", "=", chat.world_id,)
        .where("chat_participants.impersonate_actor_id", "=", impersonateActorId,)
        .where("chat_participants.actor_id", "!=", userId,)
        .executeTakeFirst();

      if (conflict) {
        return {
          code: "bad_request",
          message: "This character is already being impersonated by another user in this world",
        };
      }
    }
  }

  await database
    .updateTable("chat_participants",)
    .set({ impersonate_actor_id: impersonateActorId, },)
    .where("chat_id", "=", chatId,)
    .where("actor_id", "=", userId,)
    .execute();
}

/**
 * Mark a chat as read up to a message.
 */
export async function markChatRead(
  database: Kysely<DB>,
  chatId: string,
  userId: string,
  messageId: string,
): Promise<ServiceError | { ok: true }> {
  const participant = await database
    .selectFrom("chat_participants",)
    .select(["chat_id",],)
    .where("chat_id", "=", chatId,)
    .where("actor_id", "=", userId,)
    .executeTakeFirst();

  if (!participant) {
    return { code: "forbidden", message: "Not a participant of this chat", };
  }

  const message = await database
    .selectFrom("messages",)
    .select(["id",],)
    .where("id", "=", messageId,)
    .where("chat_id", "=", chatId,)
    .executeTakeFirst();

  if (!message) {
    return { code: "not_found", message: "Message not found in this chat", };
  }

  await database
    .updateTable("chat_participants",)
    .set({ last_read_message_id: messageId, },)
    .where("chat_id", "=", chatId,)
    .where("actor_id", "=", userId,)
    .execute();

  return { ok: true, };
}

// ─── Message Access ───────────────────────────────────────────

/**
 * Check if a user can access a specific message.
 *
 * @returns The message row if access granted, or ServiceError
 */
export async function getMessageWithAccess(
  database: Kysely<DB>,
  messageId: string,
  userId: string | null,
  userRole: string | null,
): Promise<Record<string, unknown> | ServiceError> {
  const message = await database
    .selectFrom("messages",)
    .selectAll()
    .where("id", "=", messageId,)
    .executeTakeFirst();

  if (!message) {
    return { code: "not_found", message: "Message not found", };
  }

  const chat = await database
    .selectFrom("chats",)
    .select("created_by",)
    .where("id", "=", message.chat_id,)
    .executeTakeFirst();

  if (!chat || (chat.created_by !== userId && userRole !== "admin" && userRole !== "solo")) {
    return { code: "not_found", message: "Message not found", };
  }

  return message;
}

// ─── Message CRUD ─────────────────────────────────────────────

export interface ListMessagesParams {
  chatId: string;
  page?: number;
  pageSize?: number;
  parentId?: string;
}

/**
 * List messages in a chat with pagination and variant info.
 */
export async function listMessages(
  database: Kysely<DB>,
  params: ListMessagesParams,
): Promise<{ data: Record<string, unknown>[]; total: number }> {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 20;
  const offset = (page - 1) * pageSize;

  let countQuery = database
    .selectFrom("messages",)
    .select(database.fn.countAll<number>().as("total",),)
    .where("chat_id", "=", params.chatId,)
    .where("visibility", "=", "visible",);

  if (params.parentId !== undefined) {
    countQuery = countQuery.where("parent_id", "=", params.parentId,);
  }

  const countResult = await countQuery.executeTakeFirst();
  const total = countResult?.total ?? 0;

  let listQuery = database
    .selectFrom("messages",)
    .selectAll()
    .where("chat_id", "=", params.chatId,)
    .where("visibility", "=", "visible",);

  if (params.parentId !== undefined) {
    listQuery = listQuery.where("parent_id", "=", params.parentId,);
  }

  const messages = await listQuery
    .orderBy("created_at", "asc",)
    .limit(pageSize,)
    .offset(offset,)
    .execute();

  // Compute variant counts/indexes
  const parentIds = [...new Set(messages.map((m,) => m.parent_id).filter(Boolean,),),];
  const variantCounts = new Map<string, number>();
  const variantIndexes = new Map<string, number>();

  if (parentIds.length > 0) {
    const siblings = await database
      .selectFrom("messages",)
      .select(["id", "parent_id", "swipe_index", "created_at",],)
      .where("parent_id", "in", parentIds as string[],)
      .where("chat_id", "=", params.chatId,)
      .where("visibility", "=", "visible",)
      .orderBy("swipe_index", "asc",)
      .orderBy("created_at", "asc",)
      .execute();

    const groups = new Map<string, { id: string; swipeIndex: number | null; createdAt: string }[]>();
    for (const s of siblings) {
      const pid = s.parent_id!;
      if (!groups.has(pid,)) { groups.set(pid, [],); }
      groups.get(pid,)!.push({ id: s.id, swipeIndex: s.swipe_index, createdAt: s.created_at, },);
    }
    for (const [pid, items,] of groups) {
      variantCounts.set(pid, items.length,);
      for (const [idx, item,] of items.entries()) { variantIndexes.set(item.id, idx,); }
    }
  }

  const enriched = messages.map((m,) => ({
    ...m,
    variantIndex: m.parent_id ? (variantIndexes.get(m.id,) ?? 0) : undefined,
    totalVariants: m.parent_id ? (variantCounts.get(m.parent_id,) ?? 1) : undefined,
  }));

  return { data: enriched as unknown as Record<string, unknown>[], total, };
}

/**
 * Get message variants (swipe alternatives).
 */
export async function getMessageVariants(
  database: Kysely<DB>,
  parentId: string,
  chatId: string,
): Promise<Record<string, unknown>[]> {
  return database
    .selectFrom("messages",)
    .selectAll()
    .where("parent_id", "=", parentId,)
    .where("chat_id", "=", chatId,)
    .orderBy("swipe_index", "asc",)
    .orderBy("created_at", "asc",)
    .execute();
}

/**
 * Select a variant by index.
 */
export async function selectVariant(
  database: Kysely<DB>,
  parentId: string,
  chatId: string,
  variantIndex: number,
): Promise<Record<string, unknown> | ServiceError> {
  const variants = await getMessageVariants(database, parentId, chatId,);
  const selected = variants[variantIndex];
  if (!selected) {
    return { code: "bad_request", message: "Invalid variant index", };
  }
  return selected;
}

// ─── Message Variant Regeneration ─────────────────────────────

export interface RegenerateVariantParams {
  chatId: string;
  messageId: string;
  userId: string | null;
  userRole: string | null;
}

export type RegenerateVariantResult =
  | ServiceError
  | { ok: true; replayed: boolean; variantMessageId: string; swipeIndex: number };

/** Prefix for the idempotency mark on pending regen variant rows. */
const REGEN_IDEMPOTENCY_PREFIX = "regen:variant:";

/**
 * Regenerate a message as a NEW SIBLING VARIANT rather than mutating it.
 *
 * Creates a fresh `messages` row sharing the same `parent_id` as the target,
 * with `swipe_index = max(sibling swipe_index) + 1`, so the old variant is
 * preserved as an alternative and the new row is picked up by listMessages /
 * getMessageVariants (its variant counter increments).
 *
 * The new row copies the original's role/content as a placeholder with status
 * "sending" until a generation pass attaches final content. Idempotent: a
 * repeat while a regen variant is still pending for the same parent returns
 * the existing row instead of creating a duplicate.
 *
 * @returns RegenerateVariantResult — ok+ids on success, ServiceError otherwise
 */
export async function regenerateMessageVariant(
  database: Kysely<DB>,
  params: RegenerateVariantParams,
): Promise<RegenerateVariantResult> {
  const { chatId, messageId, userId, userRole, } = params;

  // The target message must exist and belong to the chat.
  const message = await database
    .selectFrom("messages",)
    .selectAll()
    .where("id", "=", messageId,)
    .where("chat_id", "=", chatId,)
    .executeTakeFirst();

  if (!message) {
    return { code: "not_found", message: "Message not found", };
  }

  // Permission: chat owner, admin/solo, or the message author.
  const chat = await database
    .selectFrom("chats",)
    .select("created_by",)
    .where("id", "=", chatId,)
    .executeTakeFirst();

  const isOwner = chat?.created_by === userId;
  const isAdmin = userRole === "admin" || userRole === "solo";
  const isAuthor = message.actor_id === userId;
  if (!isOwner && !isAdmin && !isAuthor) {
    return { code: "forbidden", message: "Not authorized to regenerate this message", };
  }

  // Fork position: the parent the target branches from.
  const parentId = message.parent_id ?? null;
  const regenKey = `${REGEN_IDEMPOTENCY_PREFIX}${parentId}`;

  // Idempotency: a pending regen variant for this parent is reused, not duplicated.
  const pending = parentId
    ? await database
      .selectFrom("messages",)
      .select(["id", "swipe_index",],)
      .where("chat_id", "=", chatId,)
      .where("parent_id", "=", parentId,)
      .where("idempotency_key", "=", regenKey,)
      .where("status", "=", MessageStatus.Sending,)
      .executeTakeFirst()
    : undefined;

  if (pending) {
    return {
      ok: true,
      replayed: true,
      variantMessageId: pending.id,
      swipeIndex: pending.swipe_index ?? 0,
    };
  }

  // Next swipe index among siblings sharing the same parent.
  let swipeIndex = 0;
  if (parentId) {
    const maxRow = await database
      .selectFrom("messages",)
      .select(database.fn.max("swipe_index",).as("max_idx",),)
      .where("chat_id", "=", chatId,)
      .where("parent_id", "=", parentId,)
      .executeTakeFirst();
    swipeIndex = (maxRow?.max_idx ?? -1) + 1;
  }

  const variantMessageId = crypto.randomUUID();
  await database
    .insertInto("messages",)
    .values({
      id: variantMessageId,
      chat_id: chatId,
      actor_id: message.actor_id,
      parent_id: parentId,
      role: message.role,
      content: message.content,
      key_id: message.key_id,
      content_type: message.content_type,
      content_format: message.content_format,
      content_encoding: message.content_encoding,
      emotion: message.emotion,
      status: MessageStatus.Sending,
      visibility: MessageVisibility.Visible,
      swipe_index: swipeIndex,
      idempotency_key: regenKey,
    },)
    .execute();

  return { ok: true, replayed: false, variantMessageId, swipeIndex, };
}

/**
 * Soft-delete a message (set visibility to hidden_by_user).
 */
export async function deleteMessage(
  database: Kysely<DB>,
  messageId: string,
  actorId: string,
): Promise<ServiceError | { ok: true }> {
  const message = await database
    .selectFrom("messages",)
    .selectAll()
    .where("id", "=", messageId,)
    .executeTakeFirst();

  if (!message) {
    return { code: "not_found", message: "Message not found", };
  }

  await database
    .updateTable("messages",)
    .set({ visibility: "hidden_by_user", hidden_by: actorId, },)
    .where("id", "=", messageId,)
    .execute();

  return { ok: true, };
}

/**
 * Edit a user message's content.
 */
export async function editMessage(
  database: Kysely<DB>,
  messageId: string,
  userId: string,
  userRole: string | null,
  newContent: string,
): Promise<ServiceError | { id: string; content: string; edited_at: string }> {
  const msg = await database
    .selectFrom("messages",)
    .select(["id", "actor_id", "role", "chat_id",],)
    .where("id", "=", messageId,)
    .executeTakeFirst();

  if (!msg) {
    return { code: "not_found", message: "Message not found", };
  }

  if (msg.actor_id !== userId && userRole !== "admin") {
    return { code: "forbidden", message: "Cannot edit this message", };
  }

  if (msg.role !== "user") {
    return { code: "bad_request", message: "Only user messages can be edited", };
  }

  const now = new Date().toISOString();
  await database
    .updateTable("messages",)
    .set({ content: newContent.trim(), edited_at: now, },)
    .where("id", "=", messageId,)
    .execute();

  return { id: messageId, content: newContent.trim(), edited_at: now, };
}

/**
 * Update message visibility.
 */
export async function updateMessageVisibility(
  database: Kysely<DB>,
  messageId: string,
  visibility: string,
  reason: string | null,
): Promise<{ ok: true }> {
  await database
    .updateTable("messages",)
    .set({ visibility: visibility as never, hidden_reason: reason ?? null, },)
    .where("id", "=", messageId,)
    .execute();
  return { ok: true, };
}

/**
 * Update message status (admin only).
 */
export async function updateMessageStatus(
  database: Kysely<DB>,
  messageId: string,
  status: string,
): Promise<{ ok: true }> {
  await database.updateTable("messages",).set({ status: status as never, },).where("id", "=", messageId,).execute();
  return { ok: true, };
}

// ─── Context Window (existing) ────────────────────────────────

/**
 * Get the full context state for a chat.
 *
 * Combines chat settings, participants, and message history
 * into a complete ContextWindow state.
 *
 * @param database - Kysely instance
 * @param chatId - Chat ID
 * @returns Context window state, or null if chat not found
 */
export async function getChatContext(
  database: Kysely<DB>,
  chatId: string,
): Promise<ContextWindow | null> {
  const chat = await database
    .selectFrom("chats",)
    .select(["id", "mode", "context_max_tokens", "world_id",],)
    .where("id", "=", chatId,)
    .executeTakeFirst();

  if (!chat) { return null; }

  const mode = chat.mode ?? "direct";
  const maxTokens = chat.context_max_tokens ?? 32_000;

  const participants = await database
    .selectFrom("chat_participants",)
    .innerJoin("actors", "actors.id", "chat_participants.actor_id",)
    .select(["chat_participants.actor_id", "actors.display_name",],)
    .where("chat_participants.chat_id", "=", chatId,)
    .execute();

  const activeParticipants = participants.map((p,) => p.actor_id);

  const messages = await database
    .selectFrom("messages",)
    .select(["id", "role", "content", "token_count_total", "created_at",],)
    .where("chat_id", "=", chatId,)
    .where("visibility", "=", "visible",)
    .orderBy("created_at", "desc",)
    .limit(100,)
    .execute();

  const messageRefs = messages.reverse().map((m,) => ({
    messageId: m.id,
    role: m.role,
    content: m.content ?? "",
    tokenCount: m.token_count_total ?? estimateTokens(m.content ?? "",),
    createdAt: m.created_at,
  }));

  return computeContextWindow(messageRefs, maxTokens, {
    mode,
    activeParticipants,
  },);
}

// ─── Response Length (existing) ───────────────────────────────

/**
 * Get the resolved response length for a chat.
 */
export async function getResponseLength(
  database: Kysely<DB>,
  chatId: string,
): Promise<ResponseLengthConfig> {
  const chat = await database
    .selectFrom("chats",)
    .select(["response_length_preset", "response_length_custom",],)
    .where("id", "=", chatId,)
    .executeTakeFirst();

  return resolveResponseLength(
    chat?.response_length_preset as ResponseLengthPreset | null,
    chat?.response_length_custom ?? null,
    null,
  );
}

// ─── Feature Flags (existing) ────────────────────────────────

/**
 * Get feature flags for a chat.
 */
export async function getFeatureFlags(
  database: Kysely<DB>,
  chatId: string,
): Promise<ModeFeatureFlags> {
  const chat = await database
    .selectFrom("chats",)
    .select(["mode",],)
    .where("id", "=", chatId,)
    .executeTakeFirst();

  const mode = chat?.mode ?? "direct";
  return resolveFeatureFlags(mode,);
}
