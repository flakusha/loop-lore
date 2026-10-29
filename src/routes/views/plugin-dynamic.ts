// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { can, } from "../../users/permissions";
import { SuccessResponse, } from "../../validation/schemas";
import { requireUserId, } from "../http-utils";
import { type ViewsViewer, } from "./access";
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
 * The viewer behind `/dynamic/characters/*`, or the 401 the auth middleware
 * returns. Anonymous callers must not reach the grid, the edit form or the
 * chat list: the grid reads actor rows and the edit form renders system
 * prompts, both under the same ownership rule.
 * @param ctx
 * @returns the viewer, or a Response to send back
 */
function characterViewer(ctx: unknown,): ViewsViewer | Response {
  const userId = requireUserId(ctx,);
  if (typeof userId !== "string") { return userId; }
  return { userId, userRole: (ctx as { userRole?: string | null }).userRole ?? null, };
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

      const viewer = characterViewer(ctx,);
      if (viewer instanceof Response) { return viewer; }

      if (wantsJson) {
        return jsonViewModelResponse(await loadCharactersGridViewModel(database, viewer,),);
      }

      return await serveCharactersGrid(database, viewer,);
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

      // Same ownership rule as the grid: this fragment lists the same actor
      // rows, so it must not become a way around the grid's scoping.
      const viewer = characterViewer(ctx,);
      if (viewer instanceof Response) { return viewer; }

      const url = new URL(ctx.request.url,);
      return await serveCharactersSearch(database, url.searchParams, viewer,);
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
        // Timeline branch to scope events to (?timeline=<world_timelines.id>);
        // absent/unknown falls back to the prime branch inside the loader.
        (ctx.query.timeline as string | undefined) ?? null,
      );
    }, {
      query: t.Object({ timeline: t.Optional(t.String({ maxLength: 64, },),), },),
      response: { 200: SuccessResponse, },
    },)
    .get("/dynamic/characters/:id/edit-form", async (ctx,) => {
      const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
      if (!isHtmx) {
        return new Response(null, { status: 302, headers: { Location: "/views/", }, },);
      }

      const viewer = characterViewer(ctx,);
      if (viewer instanceof Response) { return viewer; }

      return await serveCharacterEditForm(ctx.params.id, database, viewer, ctx.request,);
    }, {
      response: { 200: SuccessResponse, },
    },)
    .get("/dynamic/characters/:id/chat-list", async (ctx,) => {
      const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
      if (!isHtmx) {
        return new Response(null, { status: 302, headers: { Location: "/views/", }, },);
      }

      const viewer = characterViewer(ctx,);
      if (viewer instanceof Response) { return viewer; }

      return await serveCharacterChatListDb(ctx.params.id, database, viewer,);
    }, {
      response: { 200: SuccessResponse, },
    },);
}
