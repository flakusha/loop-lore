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
import { isReadablePost, } from "./post-read-policy.js";

/** Filter shape accepted by BlogService.listPosts. */
type ListFilters = Parameters<InstanceType<typeof BlogService>["listPosts"]>[0];

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
      // see isReadablePost — denied rows answer 404 (not 403) so post
      // existence is not leaked.
      if (!isReadablePost(post, userId, can(userRole, "admin.settings",),)) {
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
      const { userRole, } = extractAuth(ctx,);
      const query = ctx.query as Record<string, string>;
      const limit = query.limit ? Number(query.limit,) : undefined;
      const offset = query.offset ? Number(query.offset,) : undefined;
      // List policy (BUG-blog-comments-post-accepts-non-public-posts —
      // client-controlled ?visibility=/?status= passthrough): non-admin
      // callers may never widen the result set past the row-level read
      // policy. Branches:
      // - admin: full filter power;
      // - visibility=followers: the follower feed (followers-only posts of
      //   followed authors; userId scopes the author set);
      // - author_id=self: the author's own management view (any status);
      // - otherwise: public browse — public+published only.
      let filters: ListFilters;
      if (can(userRole, "admin.settings",)) {
        filters = {
          author_id: query.author_id,
          visibility: query.visibility as BlogPostVisibility | undefined,
          status: query.status as BlogPostStatus | undefined,
          category: query.category,
          world_id: query.world_id,
          limit,
          offset,
          userId,
        };
      } else if (query.visibility === BlogPostVisibility.Followers) {
        filters = {
          visibility: BlogPostVisibility.Followers,
          userId,
          category: query.category,
          world_id: query.world_id,
          limit,
          offset,
        };
      } else if (query.author_id === userId) {
        filters = {
          author_id: userId,
          visibility: query.visibility as BlogPostVisibility | undefined,
          status: query.status as BlogPostStatus | undefined,
          category: query.category,
          world_id: query.world_id,
          limit,
          offset,
        };
      } else {
        filters = {
          author_id: query.author_id,
          visibility: BlogPostVisibility.Public,
          status: BlogPostStatus.Published,
          category: query.category,
          world_id: query.world_id,
          limit,
          offset,
        };
      }
      const posts = await svc.listPosts(filters,);
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
