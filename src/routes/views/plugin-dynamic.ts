// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { can, } from "../../users/permissions";
import { SuccessResponse, } from "../../validation/schemas";
import { requireUserId, } from "../http-utils";
import {
  loadCharactersGridViewModel,
  serveCharacterChatListDb,
  serveCharacterEditForm,
  serveCharactersGrid,
} from "./characters";
import {
  type ChatListViewer,
  loadChatsListViewModel,
  loadChatsSearchViewModel,
  serveChatsListDb,
  serveChatsSearch,
} from "./chats";
import { loadGalleryGridViewModel, serveGalleryGrid, } from "./gallery";
import { jsonViewModelResponse, wantsJsonViewModel, } from "./negotiate";
import { loadGallerySearchViewModel, serveCharactersSearch, serveGallerySearch, serveWorldsSearch, } from "./search";
import { serveWorldDetailContent, serveWorldsListDb, } from "./worlds";

/**
 * The viewer behind `/dynamic/chats/*`, or the 401 the auth middleware
 * returns. Anonymous callers must not reach either chat loader: both branches
 * (JSON and htmx) read the same private data.
 * @param ctx
 * @returns the viewer, or a Response to send back
 */
function chatListViewer(ctx: unknown,): ChatListViewer | Response {
  const userId = requireUserId(ctx,);
  if (typeof userId !== "string") { return userId; }
  const userRole = (ctx as { userRole?: string | null }).userRole;
  return { userId, isAdmin: can(userRole ?? null, "admin.chat",), };
}

/**
 * @param database
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { dynamic: { characters: { ...; }; }; } & ... 9 more ... & { ...; }, { ...; }, { ...; }>}
 */
export function dynamicRoutes(database: Kysely<DB>,) {
  return new Elysia({ name: "views-dynamic", },)
    // ── Dynamic partials (server-rendered data) ─────────────
    .get("/dynamic/characters/grid", async (ctx,) => {
      const wantsJson = wantsJsonViewModel({ accept: ctx.request.headers.get("Accept",), },);
      const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
      if (!isHtmx && !wantsJson) {
        return new Response(null, { status: 302, headers: { Location: "/views/", }, },);
      }

      if (wantsJson) {
        return jsonViewModelResponse(await loadCharactersGridViewModel(database,),);
      }

      return await serveCharactersGrid(database,);
    }, {
      response: { 200: SuccessResponse, },
    },)
    .get("/dynamic/gallery/grid", async (ctx: any,) => {
      const wantsJson = wantsJsonViewModel({ accept: ctx.request.headers.get("Accept",), },);
      const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
      if (!isHtmx && !wantsJson) {
        return new Response(null, { status: 302, headers: { Location: "/views/", }, },);
      }

      const url = new URL(ctx.request.url,);
      if (wantsJson) {
        const load = await loadGalleryGridViewModel({
          database,
          params: url.searchParams,
          actorId: ctx.userId as string | null,
          actorRole: (ctx.userRole as string | null) ?? null,
        },);

        if (!load.ok) {
          return jsonViewModelResponse({ error: load.error, },);
        }

        return jsonViewModelResponse(load.viewModel,);
      }

      return await serveGalleryGrid(
        database,
        url.searchParams,
        ctx.userId as string | null,
        (ctx.userRole as string | null) ?? null,
      );
    }, {
      response: { 200: SuccessResponse, },
    },)
    .get("/dynamic/worlds/list", async (ctx: any,) => {
      const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
      if (!isHtmx) {
        return new Response(null, { status: 302, headers: { Location: "/views/", }, },);
      }

      return await serveWorldsListDb(database, ctx.userId as string | null, (ctx.userRole as string | null) ?? null,);
    }, {
      response: { 200: SuccessResponse, },
    },)
    // HTMX search endpoints
    .get("/dynamic/gallery/search", async (ctx: any,) => {
      const wantsJson = wantsJsonViewModel({ accept: ctx.request.headers.get("Accept",), },);
      const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
      if (!isHtmx && !wantsJson) {
        return new Response(null, { status: 302, headers: { Location: "/views/", }, },);
      }

      const url = new URL(ctx.request.url,);
      if (wantsJson) {
        return jsonViewModelResponse(
          await loadGallerySearchViewModel({
            database,
            params: url.searchParams,
            actorId: ctx.userId as string | null,
            actorRole: (ctx.userRole as string | null) ?? null,
          },),
        );
      }

      return await serveGallerySearch(
        database,
        url.searchParams,
        ctx.userId as string | null,
        (ctx.userRole as string | null) ?? null,
      );
    }, {
      response: { 200: SuccessResponse, },
    },)
    .get("/dynamic/characters/search", async (ctx,) => {
      const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
      if (!isHtmx) {
        return new Response(null, { status: 302, headers: { Location: "/views/", }, },);
      }

      const url = new URL(ctx.request.url,);
      return await serveCharactersSearch(database, url.searchParams,);
    }, {
      response: { 200: SuccessResponse, },
    },)
    .get("/dynamic/worlds/search", async (ctx: any,) => {
      const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
      if (!isHtmx) {
        return new Response(null, { status: 302, headers: { Location: "/views/", }, },);
      }

      const url = new URL(ctx.request.url,);
      return await serveWorldsSearch(
        database,
        url.searchParams,
        ctx.userId as string | null,
        (ctx.userRole as string | null) ?? null,
      );
    }, {
      response: { 200: SuccessResponse, },
    },)
    .get("/dynamic/chats/list", async (ctx,) => {
      const wantsJson = wantsJsonViewModel({ accept: ctx.request.headers.get("Accept",), },);
      const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
      if (!isHtmx && !wantsJson) {
        return new Response(null, { status: 302, headers: { Location: "/views/", }, },);
      }

      // Chats are private per user: every branch (JSON view-model and htmx
      // fragment) needs a viewer, and the loaders scope the query to it.
      const viewer = chatListViewer(ctx,);
      if (viewer instanceof Response) { return viewer; }
      const url = new URL(ctx.request.url,);
      if (wantsJson) {
        return jsonViewModelResponse(await loadChatsListViewModel({ database, params: url.searchParams, viewer, },),);
      }

      return await serveChatsListDb(database, url.searchParams, viewer,);
    }, {
      response: { 200: SuccessResponse, },
    },)
    .get("/dynamic/chats/search", async (ctx,) => {
      const wantsJson = wantsJsonViewModel({ accept: ctx.request.headers.get("Accept",), },);
      const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
      if (!isHtmx && !wantsJson) {
        return new Response(null, { status: 302, headers: { Location: "/views/", }, },);
      }

      const viewer = chatListViewer(ctx,);
      if (viewer instanceof Response) { return viewer; }
      const url = new URL(ctx.request.url,);
      if (wantsJson) {
        return jsonViewModelResponse(await loadChatsSearchViewModel({ database, params: url.searchParams, viewer, },),);
      }

      return await serveChatsSearch(database, url.searchParams, viewer,);
    }, {
      response: { 200: SuccessResponse, },
    },)
    .get("/dynamic/worlds/:id/detail", async (ctx: any,) => {
      const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
      if (!isHtmx) {
        return new Response(null, { status: 302, headers: { Location: "/views/", }, },);
      }

      return await serveWorldDetailContent(
        ctx.params.id,
        database,
        ctx.userId as string | null,
        (ctx.userRole as string | null) ?? null,
      );
    }, {
      response: { 200: SuccessResponse, },
    },)
    .get("/dynamic/characters/:id/edit-form", async (ctx,) => {
      const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
      if (!isHtmx) {
        return new Response(null, { status: 302, headers: { Location: "/views/", }, },);
      }

      return await serveCharacterEditForm(ctx.params.id, database, ctx.request,);
    }, {
      response: { 200: SuccessResponse, },
    },)
    .get("/dynamic/characters/:id/chat-list", async (ctx,) => {
      const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
      if (!isHtmx) {
        return new Response(null, { status: 302, headers: { Location: "/views/", }, },);
      }

      return await serveCharacterChatListDb(ctx.params.id, database,);
    }, {
      response: { 200: SuccessResponse, },
    },);
}
