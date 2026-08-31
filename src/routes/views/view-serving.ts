// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { ALLOWED_VIEWS, } from "./constants";
import { loadView, notFoundView, respond, } from "./layout";

/**
 * @param viewName
 * @param isHtmx
 * @param userId
 * @param sessionId
 * @param request
 * @param t
 */
function serveView(
  viewName: string,
  isHtmx = false,
  userId?: string | null,
  sessionId?: string | null,
  request?: Request | null,
  t?: (key: string,) => string,
): Response | null {
  viewName = viewName === "assets" ? "gallery" : viewName;
  if (!ALLOWED_VIEWS.has(viewName,)) { return null; }

  const content = loadView(viewName,);
  if (!content) { return null; }

  const title = viewName === "index" ? undefined : viewName.charAt(0,).toUpperCase() + viewName.slice(1,);
  return respond(content, isHtmx, title, userId, sessionId, request, t,);
}

/**
 * @param slug
 * @param isHtmx
 * @param userId
 * @param sessionId
 * @param request
 * @param t
 */
function serveCharacterChatList(
  slug: string,
  isHtmx = false,
  userId?: string | null,
  sessionId?: string | null,
  request?: Request | null,
  t?: (key: string,) => string,
): Response | null {
  let content = loadView("character-chat-list",);
  if (!content) { return null; }

  content = content.replaceAll("{{characterSlug}}", () => slug,);
  return respond(content, isHtmx, `${slug} — Chats`, userId, sessionId, request, t,);
}

/**
 * @param slug
 * @param _chatId
 * @param isHtmx
 * @param userId
 * @param sessionId
 * @param request
 * @param t
 */
function serveCharacterChat(
  slug: string,
  _chatId: string,
  isHtmx = false,
  userId?: string | null,
  sessionId?: string | null,
  request?: Request | null,
  t?: (key: string,) => string,
): Response | null {
  const content = loadView("chat",);
  if (!content) { return null; }

  return respond(content, isHtmx, `${slug} — Chat`, userId, sessionId, request, t,);
}

/**
 * @param isHtmx
 * @param userId
 * @param sessionId
 * @param request
 * @param t
 */
function serveWorldsList(
  isHtmx = false,
  userId?: string | null,
  sessionId?: string | null,
  request?: Request | null,
  t?: (key: string,) => string,
): Response | null {
  return serveView("worlds", isHtmx, userId, sessionId, request, t,);
}

/**
 * @param worldId
 * @param database
 * @param isHtmx
 * @param userId
 * @param sessionId
 * @param request
 * @param t
 */
async function serveWorldDetail(
  worldId: string,
  database: Kysely<DB>,
  isHtmx = false,
  userId?: string | null,
  sessionId?: string | null,
  request?: Request | null,
  t?: (key: string,) => string,
): Promise<Response | null> {
  const world = await database.selectFrom("worlds",).select("id",).where("id", "=", worldId,).executeTakeFirst();
  if (!world) { return notFoundView("World not found", isHtmx, "World not found", userId, sessionId, request,); }

  let content = loadView("world-detail",);
  if (!content) { return null; }

  content = content.replaceAll("{{worldId}}", () => worldId,);
  return respond(content, isHtmx, "World — Details", userId, sessionId, request, t,);
}

/**
 * @param worldId
 * @param database
 * @param isHtmx
 * @param userId
 * @param sessionId
 * @param request
 * @param t
 */
async function serveWorldEdit(
  worldId: string,
  database: Kysely<DB>,
  isHtmx = false,
  userId?: string | null,
  sessionId?: string | null,
  request?: Request | null,
  t?: (key: string,) => string,
): Promise<Response | null> {
  const world = await database.selectFrom("worlds",).select("id",).where("id", "=", worldId,).executeTakeFirst();
  if (!world) { return notFoundView("World not found", isHtmx, "World not found", userId, sessionId, request,); }

  let content = loadView("world-edit",);
  if (!content) { return null; }

  content = content.replaceAll("{{worldId}}", () => worldId,);
  return respond(content, isHtmx, "Edit World", userId, sessionId, request, t,);
}

/**
 * @param characterId
 * @param database
 * @param isHtmx
 * @param userId
 * @param sessionId
 * @param request
 * @param t
 */
async function serveCharacterEdit(
  characterId: string,
  database: Kysely<DB>,
  isHtmx = false,
  userId?: string | null,
  sessionId?: string | null,
  request?: Request | null,
  t?: (key: string,) => string,
): Promise<Response | null> {
  const actor = await database
    .selectFrom("actors",)
    .select("id",)
    .where("id", "=", characterId,)
    .executeTakeFirst();
  if (!actor) {
    return notFoundView(
      "Character not found",
      isHtmx,
      "Character not found",
      userId,
      sessionId,
      request,
    );
  }

  let content = loadView("character-edit",);
  if (!content) { return null; }

  content = content.replaceAll("{{characterId}}", () => characterId,);
  return respond(content, isHtmx, "Edit Character", userId, sessionId, request, t,);
}

export {
  serveCharacterChat,
  serveCharacterChatList,
  serveCharacterEdit,
  serveView,
  serveWorldDetail,
  serveWorldEdit,
  serveWorldsList,
};
