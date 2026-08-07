/**
 * Chat setup template CRUD + built-in starter templates.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { jsonStringifyOr, } from "../../utils";
import type { ChatSetupTemplate, TemplateMutationResult, } from "./types";

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
