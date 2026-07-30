/**
 * Blog Routes
 *
 * REST API for blog posts, comments, follows, and moderation.
 * Blog records reuse chat-shaped content; routes manage the
 * blog-specific metadata layer.
 */
import { Elysia, } from "elysia";
import type { TranslatorFn, } from "../i18n/types";
import { BlogService, } from "../rpg/blog/service.js";
import { type HandlerOpts, } from "./actor-auth.js";
import { extractAuth, HttpStatus, jsonError, } from "./http-utils.js";

export function blogRoutes(opts: HandlerOpts,) {
  const { database, } = opts;
  const svc = new BlogService(database,);

  return new Elysia({ name: "blog", },)
    // ── Posts ────────────────────────────────────────────
    .post("/api/blog/posts", async (ctx: any,) => {
      const { userId, } = extractAuth(ctx,);
      const t = ctx.t as TranslatorFn | undefined;
      if (!userId) {
        return jsonError({ message: "errors.unauthorized", status: HttpStatus.Unauthorized, t, },);
      }

      const body = ctx.body as Record<string, unknown>;
      const title = body.title as string | undefined;
      const contentBody = body.body as string | undefined;
      if (!title || !contentBody) {
        return jsonError({
          message: "errors.missingField",
          status: HttpStatus.BadRequest,
          t,
        },);
      }

      const post = await svc.createPost({
        author_id: userId,
        title,
        body: contentBody,
        visibility: body.visibility as any,
        author_type: body.author_type as any,
        category: body.category as string | undefined,
        world_id: body.world_id as string | undefined,
        character_id: body.character_id as string | undefined,
        tags: body.tags as string[] | undefined,
        scheduled_at: body.scheduled_at as string | undefined,
        metadata: body.metadata as Record<string, unknown> | undefined,
      },);

      return { success: true, post, };
    }, {
      detail: {
        summary: "Create blog post",
        description: "Create a new blog post with title, body, and optional metadata.",
        tags: ["Blog",],
      },
    },)
    .get("/api/blog/posts/:id", async (ctx: any,) => {
      const t = ctx.t as TranslatorFn | undefined;
      const post = await svc.getPost(ctx.params.id,);
      if (!post) {
        return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },);
      }
      await svc.incrementViewCount(post.id,);
      return { success: true, post, };
    }, {
      detail: {
        summary: "Get blog post",
        description: "Get a single blog post by ID and increment its view count.",
        tags: ["Blog",],
      },
    },)
    .get("/api/blog/posts", async (ctx: any,) => {
      const query = ctx.query as Record<string, string>;
      const posts = await svc.listPosts({
        author_id: query.author_id,
        visibility: query.visibility as any,
        status: query.status as any,
        category: query.category,
        world_id: query.world_id,
        limit: query.limit ? Number(query.limit,) : undefined,
        offset: query.offset ? Number(query.offset,) : undefined,
      },);
      return { success: true, posts, count: posts.length, };
    }, {
      detail: {
        summary: "List blog posts",
        description: "List blog posts with optional filters for author, visibility, status, category, and world.",
        tags: ["Blog",],
      },
    },)
    .patch("/api/blog/posts/:id", async (ctx: any,) => {
      const { userId, userRole, } = extractAuth(ctx,);
      const t = ctx.t as TranslatorFn | undefined;
      if (!userId) {
        return jsonError({ message: "errors.unauthorized", status: HttpStatus.Unauthorized, t, },);
      }

      const body = ctx.body as Record<string, unknown>;
      const post = await svc.getPost(ctx.params.id,);
      if (!post) {
        return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },);
      }
      if (post.author_id !== userId && userRole !== "admin") {
        return jsonError({ message: "errors.forbidden", status: HttpStatus.Forbidden, t, },);
      }

      const updated = await svc.updatePost(ctx.params.id, {
        title: body.title as string | undefined,
        body: body.body as string | undefined,
        visibility: body.visibility as any,
        status: body.status as any,
        category: body.category as string | undefined,
        tags: body.tags as string[] | undefined,
        metadata: body.metadata as Record<string, unknown> | undefined,
      },);

      return { success: true, post: updated, };
    }, {
      detail: {
        summary: "Update blog post",
        description: "Update a blog post. Only the author or an admin can update.",
        tags: ["Blog",],
      },
    },)
    .delete("/api/blog/posts/:id", async (ctx: any,) => {
      const { userId, userRole, } = extractAuth(ctx,);
      const t = ctx.t as TranslatorFn | undefined;
      if (!userId) {
        return jsonError({ message: "errors.unauthorized", status: HttpStatus.Unauthorized, t, },);
      }

      const post = await svc.getPost(ctx.params.id,);
      if (!post) {
        return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },);
      }
      if (post.author_id !== userId && userRole !== "admin") {
        return jsonError({ message: "errors.forbidden", status: HttpStatus.Forbidden, t, },);
      }

      await svc.deletePost(ctx.params.id,);
      return { success: true, };
    }, {
      detail: {
        summary: "Delete blog post",
        description: "Delete a blog post. Only the author or an admin can delete.",
        tags: ["Blog",],
      },
    },)
    // ── Comments ─────────────────────────────────────────
    .post("/api/blog/posts/:id/comments", async (ctx: any,) => {
      const { userId, } = extractAuth(ctx,);
      const t = ctx.t as TranslatorFn | undefined;
      if (!userId) {
        return jsonError({ message: "errors.unauthorized", status: HttpStatus.Unauthorized, t, },);
      }

      const body = ctx.body as Record<string, unknown>;
      const commentBody = body.body as string | undefined;
      if (!commentBody) {
        return jsonError({ message: "errors.missingField", status: HttpStatus.BadRequest, t, },);
      }

      const post = await svc.getPost(ctx.params.id,);
      if (!post) {
        return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },);
      }

      const comment = await svc.createComment({
        post_id: ctx.params.id,
        author_id: userId,
        body: commentBody,
      },);

      return { success: true, comment, };
    }, {
      detail: {
        summary: "Add comment to post",
        description: "Add a comment to a blog post.",
        tags: ["Blog",],
      },
    },)
    .get("/api/blog/posts/:id/comments", async (ctx: any,) => {
      const comments = await svc.listComments(ctx.params.id, {
        limit: ctx.query.limit ? Number(ctx.query.limit,) : undefined,
        offset: ctx.query.offset ? Number(ctx.query.offset,) : undefined,
      },);
      return { success: true, comments, count: comments.length, };
    }, {
      detail: {
        summary: "List comments on post",
        description: "List comments on a blog post with optional pagination.",
        tags: ["Blog",],
      },
    },)
    // ── Moderation ───────────────────────────────────────
    .patch("/api/blog/comments/:id/moderate", async (ctx: any,) => {
      const { userRole, } = extractAuth(ctx,);
      const t = ctx.t as TranslatorFn | undefined;
      if (userRole !== "admin") {
        return jsonError({ message: "errors.forbidden", status: HttpStatus.Forbidden, t, },);
      }

      const body = ctx.body as Record<string, unknown>;
      const status = body.status as string | undefined;
      if (!status || !["visible", "hidden", "deleted",].includes(status,)) {
        return jsonError({
          message: "errors.invalidInput",
          status: HttpStatus.BadRequest,
          t,
        },);
      }

      const ok = await svc.moderateComment(ctx.params.id, status as any,);
      if (!ok) {
        return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },);
      }
      return { success: true, };
    }, {
      detail: {
        summary: "Moderate comment",
        description: "Set a comment's visibility status (visible, hidden, deleted). Admin only.",
        tags: ["Blog", "Moderation",],
      },
    },)
    .patch("/api/blog/posts/:id/moderate", async (ctx: any,) => {
      const { userRole, } = extractAuth(ctx,);
      const t = ctx.t as TranslatorFn | undefined;
      if (userRole !== "admin") {
        return jsonError({ message: "errors.forbidden", status: HttpStatus.Forbidden, t, },);
      }

      const body = ctx.body as Record<string, unknown>;
      const status = body.status as string | undefined;
      if (
        !status ||
        !["draft", "published", "hidden", "disabled",].includes(status,)
      ) {
        return jsonError({
          message: "errors.invalidInput",
          status: HttpStatus.BadRequest,
          t,
        },);
      }

      const updated = await svc.updatePost(ctx.params.id, {
        status: status as any,
      },);
      if (!updated) {
        return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },);
      }
      return { success: true, post: updated, };
    }, {
      detail: {
        summary: "Moderate blog post",
        description: "Set a blog post's status (draft, published, hidden, disabled). Admin only.",
        tags: ["Blog", "Moderation",],
      },
    },)
    // ── Follows ──────────────────────────────────────────
    .post("/api/blog/follow/:authorId", async (ctx: any,) => {
      const { userId, } = extractAuth(ctx,);
      const t = ctx.t as TranslatorFn | undefined;
      if (!userId) {
        return jsonError({ message: "errors.unauthorized", status: HttpStatus.Unauthorized, t, },);
      }

      await svc.follow(userId, ctx.params.authorId,);
      return { success: true, };
    }, {
      detail: {
        summary: "Follow author",
        description: "Follow a blog author to receive updates.",
        tags: ["Blog", "Follows",],
      },
    },)
    .delete("/api/blog/follow/:authorId", async (ctx: any,) => {
      const { userId, } = extractAuth(ctx,);
      const t = ctx.t as TranslatorFn | undefined;
      if (!userId) {
        return jsonError({ message: "errors.unauthorized", status: HttpStatus.Unauthorized, t, },);
      }

      await svc.unfollow(userId, ctx.params.authorId,);
      return { success: true, };
    }, {
      detail: {
        summary: "Unfollow author",
        description: "Stop following a blog author.",
        tags: ["Blog", "Follows",],
      },
    },)
    .get("/api/blog/follow/:authorId/status", async (ctx: any,) => {
      const { userId, } = extractAuth(ctx,);
      const t = ctx.t as TranslatorFn | undefined;
      if (!userId) {
        return jsonError({ message: "errors.unauthorized", status: HttpStatus.Unauthorized, t, },);
      }

      const following = await svc.isFollowing(userId, ctx.params.authorId,);
      return { success: true, following, };
    }, {
      detail: {
        summary: "Check follow status",
        description: "Check if the current user follows a specific author.",
        tags: ["Blog", "Follows",],
      },
    },)
    .get("/api/blog/authors/:authorId/followers", async (ctx: any,) => {
      const followers = await svc.getFollowers(ctx.params.authorId,);
      return { success: true, followers, count: followers.length, };
    }, {
      detail: {
        summary: "List author followers",
        description: "List all followers of a blog author.",
        tags: ["Blog", "Follows",],
      },
    },)
    // ── RAG Sources ──────────────────────────────────────
    .get("/api/blog/posts/:id/sources", async (ctx: any,) => {
      const sources = await svc.getRAGSources(ctx.params.id,);
      return { success: true, sources, count: sources.length, };
    }, {
      detail: {
        summary: "List RAG sources",
        description: "List RAG (Retrieval-Augmented Generation) sources linked to a post.",
        tags: ["Blog",],
      },
    },)
    .post("/api/blog/posts/:id/sources", async (ctx: any,) => {
      const { userRole, } = extractAuth(ctx,);
      const t = ctx.t as TranslatorFn | undefined;
      if (userRole !== "admin") {
        return jsonError({ message: "errors.forbidden", status: HttpStatus.Forbidden, t, },);
      }

      const body = ctx.body as Record<string, unknown>;
      const source = await svc.addRAGSource(ctx.params.id, {
        source_type: body.source_type as any,
        uri: body.uri as string,
        title: body.title as string,
        relevance_score: (body.relevance_score as number) ?? 0,
        snippet: (body.snippet as string) ?? "",
      },);

      return { success: true, source, };
    }, {
      detail: {
        summary: "Add RAG source",
        description: "Add a RAG source to a blog post. Admin only.",
        tags: ["Blog",],
      },
    },);
}
