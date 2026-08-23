// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { adminViewGuard, } from "../../middleware/admin-gate";
import { requirePermission, } from "../../middleware/permissions";
import { SuccessResponse, } from "../../validation/schemas";
import { ALLOWED_VIEWS, } from "./constants";
import { serveNsfwModerationAudit, } from "./nsfw-audit";
import {
  serveCharacterChat,
  serveCharacterChatList,
  serveCharacterEdit,
  serveView,
  serveWorldDetail,
  serveWorldEdit,
  serveWorldsList,
} from "./view-serving";

export function pagesRoutes(database: Kysely<DB>,) {
  const nsfwGuard = requirePermission("admin.system",);
  return new Elysia({ name: "views-pages", },)
    // ── Character routes ───────────────────────────────────────
    .get("/character/:slug", (ctx: any,) => {
      const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
      const result = serveCharacterChatList(ctx.params.slug, isHtmx, ctx.userId, ctx.sessionId, ctx.request,);
      if (result) { return result; }
      return new Response("Not found", { status: 404, },);
    }, {
      response: { 200: SuccessResponse, },
    },)
    .get("/character/:slug/edit", async (ctx: any,) => {
      const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
      const result = await serveCharacterEdit(
        ctx.params.slug,
        database,
        isHtmx,
        ctx.userId,
        ctx.sessionId,
        ctx.request,
        ctx.t,
      );
      if (result) { return result; }
      return new Response("Not found", { status: 404, },);
    }, {
      response: { 200: SuccessResponse, },
    },)
    .get("/character/:slug/:chatId", (ctx: any,) => {
      const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
      const result = serveCharacterChat(
        ctx.params.slug,
        ctx.params.chatId,
        isHtmx,
        ctx.userId,
        ctx.sessionId,
        ctx.request,
      );
      if (result) { return result; }
      return new Response("Not found", { status: 404, },);
    }, {
      response: { 200: SuccessResponse, },
    },)
    .get("/characters/:id/edit", async (ctx: any,) => {
      const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
      const result = await serveCharacterEdit(
        ctx.params.id,
        database,
        isHtmx,
        ctx.userId,
        ctx.sessionId,
        ctx.request,
        ctx.t,
      );
      if (result) { return result; }
      return new Response("Not found", { status: 404, },);
    }, {
      response: { 200: SuccessResponse, },
    },)
    // ── World routes ───────────────────────────────────────────
    .get("/worlds", (ctx: any,) => {
      const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
      const result = serveWorldsList(isHtmx, ctx.userId, ctx.sessionId, ctx.request, ctx.t,);
      if (result) { return result; }
      return new Response("Not found", { status: 404, },);
    }, {
      response: { 200: SuccessResponse, },
    },)
    .get("/worlds/:id", async (ctx: any,) => {
      const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
      const result = await serveWorldDetail(
        ctx.params.id,
        database,
        isHtmx,
        ctx.userId,
        ctx.sessionId,
        ctx.request,
        ctx.t,
      );
      if (result) { return result; }
      return new Response("Not found", { status: 404, },);
    }, {
      response: { 200: SuccessResponse, },
    },)
    .get("/worlds/:id/edit", async (ctx: any,) => {
      const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
      const result = await serveWorldEdit(
        ctx.params.id,
        database,
        isHtmx,
        ctx.userId,
        ctx.sessionId,
        ctx.request,
        ctx.t,
      );
      if (result) { return result; }
      return new Response("Not found", { status: 404, },);
    }, {
      response: { 200: SuccessResponse, },
    },)
    // ── Admin view (302 redirect for unauthenticated UX) ─────────
    .guard({ beforeHandle: adminViewGuard, }, (app,) =>
      app.get("/views/admin", (ctx: any,) => {
        const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
        const result = serveView("admin", isHtmx, ctx.userId, ctx.sessionId, ctx.request, ctx.t,);
        if (result) { return result; }
        return new Response("Not found", { status: 404, },);
      }, {
        response: { 200: SuccessResponse, },
      },),)
    // ── NSFW moderation (defense-in-depth: admin.system) ─────
    .guard({ beforeHandle: nsfwGuard, }, (app,) =>
      app.get("/views/nsfw-moderation", async (ctx: any,) => {
        const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
        const targetUserId = (ctx.query?.userId as string | undefined) || (ctx.userId as string);
        const result = await serveNsfwModerationAudit(
          database,
          targetUserId ?? "",
          isHtmx,
          ctx.userId,
          ctx.sessionId,
          ctx.request,
          ctx.t,
        );
        if (result) { return result; }
        return new Response("Not found", { status: 404, },);
      }, {
        response: { 200: SuccessResponse, },
      },),)
    // ── View templates (non-admin) ──────────────────────────────
    .get("/views/:name", (ctx: any,) => {
      const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
      const name = ctx.params.name as string;

      // Redirect .html extensions to clean path; non-allowed views to /views/
      const cleanName = name.replace(/\.html?$/i, "",);
      const isHtmlExtension = /\.html?$/i.test(name,);
      if (isHtmlExtension) {
        if (ALLOWED_VIEWS.has(cleanName,)) {
          return new Response(null, { status: 302, headers: { Location: `/views/${cleanName}`, }, },);
        }
        return new Response(null, { status: 302, headers: { Location: "/views/", }, },);
      }
      if (!ALLOWED_VIEWS.has(name,)) {
        return new Response(null, { status: 302, headers: { Location: "/views/", }, },);
      }

      const result = serveView(name, isHtmx, ctx.userId, ctx.sessionId, ctx.request, ctx.t,);
      if (result) { return result; }
      return new Response("Not found", { status: 404, },);
    }, {
      response: { 200: SuccessResponse, },
    },);
}
