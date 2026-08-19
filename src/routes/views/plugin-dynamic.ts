// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { SuccessResponse, } from "../../validation/schemas";
import { serveCharacterChatListDb, serveCharacterEditForm, serveCharactersGrid, } from "./characters";
import { serveChatsListDb, serveChatsSearch, } from "./chats";
import { serveGalleryGrid, } from "./gallery";
import { serveCharactersSearch, serveGallerySearch, serveWorldsSearch, } from "./search";
import { serveWorldDetailContent, serveWorldsListDb, } from "./worlds";

export function dynamicRoutes(database: Kysely<DB>,) {
  return new Elysia({ name: "views-dynamic", },)
    // ── Dynamic partials (server-rendered data) ─────────────
    .get("/dynamic/characters/grid", async (ctx,) => {
      const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
      if (!isHtmx) {
        return new Response(null, { status: 302, headers: { Location: "/views/", }, },);
      }
      return await serveCharactersGrid(database,);
    }, {
      response: { 200: SuccessResponse, },
    },)
    .get("/dynamic/gallery/grid", async (ctx: any,) => {
      const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
      if (!isHtmx) {
        return new Response(null, { status: 302, headers: { Location: "/views/", }, },);
      }
      const url = new URL(ctx.request.url,);
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
      const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
      if (!isHtmx) {
        return new Response(null, { status: 302, headers: { Location: "/views/", }, },);
      }
      const url = new URL(ctx.request.url,);
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
      const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
      if (!isHtmx) {
        return new Response(null, { status: 302, headers: { Location: "/views/", }, },);
      }
      const url = new URL(ctx.request.url,);
      return await serveChatsListDb(database, url.searchParams,);
    }, {
      response: { 200: SuccessResponse, },
    },)
    .get("/dynamic/chats/search", async (ctx,) => {
      const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
      if (!isHtmx) {
        return new Response(null, { status: 302, headers: { Location: "/views/", }, },);
      }
      const url = new URL(ctx.request.url,);
      return await serveChatsSearch(database, url.searchParams,);
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
      return await serveCharacterEditForm(ctx.params.id, database,);
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
