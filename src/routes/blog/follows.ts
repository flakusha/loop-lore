// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import type { TranslatorFn, } from "../../i18n/types";
import { BlogService, } from "../../rpg/blog/service.js";
import { can, } from "../../users/permissions";
import {
  BlogPostResponse,
  ErrorResponse,
  ListResponse,
  SuccessResponse,
} from "../../validation/schemas";
import { type HandlerOpts, } from "../actor-auth.js";
import { extractAuth, HttpStatus, jsonError, jsonResponse, requireUserId, } from "../http-utils.js";

/**
 * @param opts
 * @param prefix
 */
export function blogFollowRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;
  const svc = new BlogService(database,);

  return new Elysia({ name: "blog-follows", },)
    .post(`${prefix}/blog/follow/:authorId`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }

      await svc.follow(userId, ctx.params.authorId,);
      return jsonResponse({ success: true, },);
    }, {
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
      },
      detail: {
        summary: "Follow author",
        description: "Follow a blog author to receive updates.",
        tags: ["Blog", "Follows",],
      },
    },)
    .delete(`${prefix}/blog/follow/:authorId`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }

      await svc.unfollow(userId, ctx.params.authorId,);
      return jsonResponse({ success: true, },);
    }, {
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
      },
      detail: {
        summary: "Unfollow author",
        description: "Stop following a blog author.",
        tags: ["Blog", "Follows",],
      },
    },)
    .get(`${prefix}/blog/follow/:authorId/status`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }

      const { following, } = await svc.getFollowStatus(userId, ctx.params.authorId,);
      return jsonResponse({ success: true, following, },);
    }, {
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
      },
      detail: {
        summary: "Check follow status",
        description: "Check if the current user follows a specific author.",
        tags: ["Blog", "Follows",],
      },
    },)
    .get(`${prefix}/blog/authors/:authorId/followers`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const { userRole, } = extractAuth(ctx,);
      const t = ctx.t as TranslatorFn | undefined;

      // The follower list is private data: only the author themselves
      // (or an admin) may enumerate it.
      // BUG-blog-followers-list-no-auth-reveals-follower-ids
      if (userId !== ctx.params.authorId && !can(userRole, "admin.settings",)) {
        return jsonError({ message: "errors.forbidden", status: HttpStatus.Forbidden, t, },);
      }

      const followers = await svc.getFollowers(ctx.params.authorId,);
      return jsonResponse({ success: true, followers, count: followers.length, },);
    }, {
      response: {
        200: ListResponse(BlogPostResponse,),
        401: ErrorResponse,
        403: ErrorResponse,
      },
      detail: {
        summary: "List author followers",
        description: "List all followers of a blog author. Only the author or an admin may view this.",
        tags: ["Blog", "Follows",],
      },
    },);
}
