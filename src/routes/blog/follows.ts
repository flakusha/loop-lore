import { Elysia, } from "elysia";
import { BlogService, } from "../../rpg/blog/service.js";
import {
  BlogPostResponse,
  ErrorResponse,
  ListResponse,
  SuccessResponse,
} from "../../validation/schemas";
import { type HandlerOpts, } from "../actor-auth.js";
import { jsonResponse, requireUserId, } from "../http-utils.js";

export function blogFollowRoutes(opts: HandlerOpts, prefix = "/api") {
  const { database, } = opts;
  const svc = new BlogService(database,);

  return new Elysia({ name: "blog-follows", },)
    .post(prefix + "/blog/follow/:authorId", async (ctx: any,) => {
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
    .delete(prefix + "/blog/follow/:authorId", async (ctx: any,) => {
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
    .get(prefix + "/blog/follow/:authorId/status", async (ctx: any,) => {
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
    .get(prefix + "/blog/authors/:authorId/followers", async (ctx: any,) => {
      const followers = await svc.getFollowers(ctx.params.authorId,);
      return jsonResponse({ success: true, followers, count: followers.length, },);
    }, {
      response: {
        200: ListResponse(BlogPostResponse,),
      },
      detail: {
        summary: "List author followers",
        description: "List all followers of a blog author.",
        tags: ["Blog", "Follows",],
      },
    },);
}
