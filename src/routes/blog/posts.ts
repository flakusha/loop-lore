// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import type { TranslatorFn, } from "../../i18n/types";
import { BlogService, } from "../../rpg/blog/service.js";
import { BlogPostStatus, BlogPostVisibility, } from "../../rpg/blog/service/types";
import { can, } from "../../users/permissions";
import {
  BlogPostCreateBody,
  BlogPostResponse,
  BlogPostUpdateBody,
  ErrorResponse,
  Id,
  ListResponse,
  SuccessResponse,
} from "../../validation/schemas";
import { type HandlerOpts, } from "../actor-auth.js";
import { extractAuth, HttpStatus, jsonError, jsonResponse, requireUserId, } from "../http-utils.js";

/**
 * @param opts
 * @param prefix
 */
export function blogPostRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;
  const svc = new BlogService(database,);

  return new Elysia({ name: "blog-posts", },)
    .post(`${prefix}/blog/posts`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }

      const post = await svc.createPost({
        author_id: userId,
        title: ctx.body.title,
        body: ctx.body.body,
        visibility: ctx.body.visibility,
        author_type: ctx.body.author_type,
        category: ctx.body.category,
        world_id: ctx.body.world_id,
        character_id: ctx.body.character_id,
        tags: ctx.body.tags,
        scheduled_at: ctx.body.scheduled_at,
        metadata: ctx.body.metadata,
      },);

      return jsonResponse({ success: true, post, },);
    }, {
      body: BlogPostCreateBody,
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
      },
      detail: {
        summary: "Create blog post",
        description: "Create a new blog post with title, body, and optional metadata.",
        tags: ["Blog",],
      },
    },)
    .get(`${prefix}/blog/posts/:id`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const { userRole, } = extractAuth(ctx,);
      const t = ctx.t as TranslatorFn | undefined;

      const post = await svc.getPost(ctx.params.id,);
      if (post === undefined) {
        return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },);
      }
      // Row-level read policy (BUG-blog-post-get-bypasses-visibility-policy):
      // a post is readable only when it is public AND published, when the
      // caller is its author, or when the caller is an admin. Denied rows
      // answer 404 (not 403) so post existence is not leaked.
      const readable = (post.visibility === BlogPostVisibility.Public &&
        post.status === BlogPostStatus.Published) ||
        post.author_id === userId ||
        can(userRole, "admin.settings",);
      if (!readable) {
        return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },);
      }
      await svc.incrementViewCount(post.id,);
      return jsonResponse({ success: true, post, },);
    }, {
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Get blog post",
        description: "Get a single blog post by ID and increment its view count.",
        tags: ["Blog",],
      },
    },)
    .get(`${prefix}/blog/posts`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const query = ctx.query as Record<string, string>;
      const posts = await svc.listPosts({
        author_id: query.author_id,
        visibility: query.visibility as any,
        status: query.status as any,
        category: query.category,
        world_id: query.world_id,
        limit: query.limit ? Number(query.limit,) : undefined,
        offset: query.offset ? Number(query.offset,) : undefined,
        userId: typeof userId === "string" ? userId : undefined,
      },);
      return jsonResponse({ success: true, posts, count: posts.length, },);
    }, {
      response: {
        200: ListResponse(BlogPostResponse,),
      },
      detail: {
        summary: "List blog posts",
        description: "List blog posts with optional filters for author, visibility, status, category, and world.",
        tags: ["Blog",],
      },
    },)
    .patch(`${prefix}/blog/posts/:id`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const { userRole, } = extractAuth(ctx,);
      const t = ctx.t as TranslatorFn | undefined;
      const isAdmin = can(userRole, "admin.settings",);

      const updated = await svc.updatePost(
        ctx.params.id,
        {
          title: ctx.body.title,
          body: ctx.body.body,
          visibility: ctx.body.visibility,
          status: ctx.body.status,
          category: ctx.body.category,
          tags: ctx.body.tags,
          metadata: ctx.body.metadata,
        },
        userId,
        isAdmin,
      );

      if (!updated) {
        return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },);
      }

      return jsonResponse({ success: true, post: updated, },);
    }, {
      params: t.Object({ id: Id, },),
      body: BlogPostUpdateBody,
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Update blog post",
        description: "Update a blog post. Only the author or an admin can update.",
        tags: ["Blog",],
      },
    },)
    .delete(`${prefix}/blog/posts/:id`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const { userRole, } = extractAuth(ctx,);
      const t = ctx.t as TranslatorFn | undefined;
      const isAdmin = can(userRole, "admin.settings",);

      const ok = await svc.deletePost(ctx.params.id, userId, isAdmin,);
      if (!ok) {
        return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },);
      }
      return jsonResponse({ success: true, },);
    }, {
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Delete blog post",
        description: "Delete a blog post. Only the author or an admin can delete.",
        tags: ["Blog",],
      },
    },);
}
