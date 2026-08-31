// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import type { TranslatorFn, } from "../../i18n/types";
import { BlogService, } from "../../rpg/blog/service.js";
import { can, } from "../../users/permissions";
import {
  BlogPostStatusBody,
  ErrorResponse,
  Id,
  SuccessResponse,
} from "../../validation/schemas";
import { type HandlerOpts, } from "../actor-auth.js";
import { extractAuth, HttpStatus, jsonError, jsonResponse, } from "../http-utils.js";

/**
 * @param opts
 * @param prefix
 */
export function blogModerationRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;
  const svc = new BlogService(database,);

  return new Elysia({ name: "blog-moderation", },)
    .patch(`${prefix}/blog/comments/:id/moderate`, async (ctx: any,) => {
      const { userRole, } = extractAuth(ctx,);
      const t = ctx.t as TranslatorFn | undefined;
      if (!can(userRole, "admin.settings",)) {
        return jsonError({ message: "errors.forbidden", status: HttpStatus.Forbidden, t, },);
      }

      const { status, } = ctx.body;
      if (!["visible", "hidden", "deleted",].includes(status,)) {
        return jsonError({
          message: "errors.invalidInput",
          status: HttpStatus.BadRequest,
          t,
        },);
      }

      const ok = await svc.moderateComment(ctx.params.id, status,);
      if (!ok) {
        return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },);
      }
      return jsonResponse({ success: true, },);
    }, {
      params: t.Object({ id: Id, },),
      body: BlogPostStatusBody,
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Moderate comment",
        description: "Set a comment's visibility status (visible, hidden, deleted). Admin only.",
        tags: ["Blog", "Moderation",],
      },
    },)
    .patch(`${prefix}/blog/posts/:id/moderate`, async (ctx: any,) => {
      const { userRole, } = extractAuth(ctx,);
      const t = ctx.t as TranslatorFn | undefined;
      if (!can(userRole, "admin.settings",)) {
        return jsonError({ message: "errors.forbidden", status: HttpStatus.Forbidden, t, },);
      }

      const { status, } = ctx.body;
      if (
        !["draft", "published", "hidden", "disabled",].includes(status,)
      ) {
        return jsonError({
          message: "errors.invalidInput",
          status: HttpStatus.BadRequest,
          t,
        },);
      }

      const updated = await svc.updatePost(ctx.params.id, {
        status: status,
      },);
      if (!updated) {
        return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },);
      }
      return jsonResponse({ success: true, post: updated, },);
    }, {
      params: t.Object({ id: Id, },),
      body: BlogPostStatusBody,
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Moderate blog post",
        description: "Set a blog post's status (draft, published, hidden, disabled). Admin only.",
        tags: ["Blog", "Moderation",],
      },
    },);
}
