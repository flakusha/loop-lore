// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import type { TranslatorFn, } from "../../i18n/types";
import { BlogService, } from "../../rpg/blog/service.js";
import {
  BlogCommentCreateBody,
  BlogCommentResponse,
  ErrorResponse,
  Id,
  ListResponse,
  SuccessResponse,
} from "../../validation/schemas";
import { type HandlerOpts, } from "../actor-auth.js";
import { HttpStatus, jsonError, jsonResponse, requireUserId, } from "../http-utils.js";

export function blogCommentRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;
  const svc = new BlogService(database,);

  return new Elysia({ name: "blog-comments", },)
    .post(`${prefix}/blog/posts/:id/comments`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const t = ctx.t as TranslatorFn | undefined;

      const post = await svc.getPost(ctx.params.id,);
      if (!post) {
        return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },);
      }

      const comment = await svc.createComment({
        post_id: ctx.params.id,
        author_id: userId,
        body: ctx.body.body,
      },);

      return jsonResponse({ success: true, comment, },);
    }, {
      params: t.Object({ id: Id, },),
      body: BlogCommentCreateBody,
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Add comment to post",
        description: "Add a comment to a blog post.",
        tags: ["Blog",],
      },
    },)
    .get(`${prefix}/blog/posts/:id/comments`, async (ctx: any,) => {
      const comments = await svc.listComments(ctx.params.id, {
        limit: ctx.query.limit ? Number(ctx.query.limit,) : undefined,
        offset: ctx.query.offset ? Number(ctx.query.offset,) : undefined,
      },);
      return jsonResponse({ success: true, comments, count: comments.length, },);
    }, {
      response: {
        200: ListResponse(BlogCommentResponse,),
        404: ErrorResponse,
      },
      detail: {
        summary: "List comments on post",
        description: "List comments on a blog post with optional pagination.",
        tags: ["Blog",],
      },
    },);
}
