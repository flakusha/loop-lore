// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Location public-chat auto-creation.
 *
 * Location creation binds a public chat to the resolved chat setup template
 * (idempotent per location). Extracted from `locations.ts` to keep files
 * under the 250-line ceiling.
 */
import type { Kysely, Transaction, } from "kysely";
import { createChat, getChatSetupTemplate, } from "../../chat/service";
import type { ChatSetupTemplate, } from "../../chat/service/types";
import type { DB, } from "../../db/schema";
import { jsonParseOr, } from "../../utils";

/** */
export interface CreateLocationChatInput {
  /** Location being created (already inserted by the caller's tx). */
  locationId: string;
  worldId: string;
  name: string;
  /** Raw location request body — explicit fields override template defaults. */
  body: Record<string, unknown>;
  /** Fallback owner when the world has no owner_id. */
  fallbackUserId: string | null;
}

/**
 * Resolve the chat setup template for a location. Defaults to the `world`
 * template so a location always gets a public chat; an explicit templateId
 * binds a non-default template, which the frontend marks.
 * @param database
 * @param body
 */
export async function resolveLocationTemplate(
  database: Kysely<DB>,
  body: Record<string, unknown>,
): Promise<ChatSetupTemplate | null> {
  const templateId = typeof body.templateId === "string" && body.templateId
    ? body.templateId
    : "template-world";
  return getChatSetupTemplate(database, templateId,);
}

/**
 * Auto-create the public location chat bound to the resolved template.
 * Idempotent: skips when a public chat for this location already exists.
 * Runs inside the caller's transaction (tx).
 * @param tx
 * @param input
 * @param template
 */
export async function createLocationChat(
  tx: Transaction<DB>,
  input: CreateLocationChatInput,
  template: ChatSetupTemplate,
): Promise<void> {
  const { locationId, worldId, name, body, fallbackUserId, } = input;
  const existingChat = await tx
    .selectFrom("chats",)
    .select("id",)
    .where("current_location_id", "=", locationId,)
    .where("visibility", "=", "public",)
    .executeTakeFirst();
  if (existingChat) { return; }

  const world = await tx
    .selectFrom("worlds",)
    .select(["owner_id",],)
    .where("id", "=", worldId,)
    .executeTakeFirst();
  const ownerId = world?.owner_id ?? fallbackUserId;

  const hasExplicit = (key: string,) => key in body;
  await createChat(tx, {
    name,
    type: "group",
    mode: hasExplicit("mode",) ? (body.mode as string) : template.mode ?? "story",
    createdBy: ownerId ?? "",
    worldId,
    currentLocationId: locationId,
    turnStrategy: hasExplicit("turnStrategy",)
      ? (body.turnStrategy as string | null)
      : template.turn_strategy,
    gmConfig: hasExplicit("gmConfig",)
      ? (body.gmConfig as Record<string, unknown> | null)
      : (template.gm_config ? jsonParseOr(template.gm_config, {},) : null),
    visualNovel: hasExplicit("visualNovel",)
      ? (body.visualNovel as boolean)
      : template.visual_novel === 1,
    visibility: hasExplicit("visibility",)
      ? (body.visibility as string)
      : (template.visibility ?? "private"),
    templateId: template.id,
  },);
}
