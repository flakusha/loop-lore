/**
 * Blog Routes
 *
 * REST API for blog posts, comments, follows, and moderation.
 * Blog records reuse chat-shaped content; routes manage the
 * blog-specific metadata layer.
 */
import { Elysia } from "elysia";
import { BlogService } from "../rpg/blog/service.js";
import { type HandlerOpts } from "./actor-auth.js";
import { HttpStatus, extractAuth, jsonError } from "./http-utils.js";

export function blogRoutes(opts: HandlerOpts) {
  const { database } = opts;
  const svc = new BlogService(database);

  return new Elysia({ name: "blog" })
    // ── Posts ────────────────────────────────────────────
    .post("/api/blog/posts", async (ctx: any) => {
      const { userId } = extractAuth(ctx);
      if (!userId) {
        return jsonError("Unauthorized", HttpStatus.Unauthorized);
      }

      const body = ctx.body as Record<string, unknown>;
      const title = body.title as string | undefined;
      const contentBody = body.body as string | undefined;
      if (!title || !contentBody) {
        return jsonError(
          "title and body are required",
          HttpStatus.BadRequest,
        );
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
      });

      return { success: true, post };
    })

    .get("/api/blog/posts/:id", async (ctx: any) => {
      const post = await svc.getPost(ctx.params.id);
      if (!post) {
        return jsonError("Post not found", HttpStatus.NotFound);
      }
      await svc.incrementViewCount(post.id);
      return { success: true, post };
    })

    .get("/api/blog/posts", async (ctx: any) => {
      const query = ctx.query as Record<string, string>;
      const posts = await svc.listPosts({
        author_id: query.author_id,
        visibility: query.visibility as any,
        status: query.status as any,
        category: query.category,
        world_id: query.world_id,
        limit: query.limit ? Number(query.limit) : undefined,
        offset: query.offset ? Number(query.offset) : undefined,
      });
      return { success: true, posts, count: posts.length };
    })

    .patch("/api/blog/posts/:id", async (ctx: any) => {
      const { userId, userRole } = extractAuth(ctx);
      if (!userId) {
        return jsonError("Unauthorized", HttpStatus.Unauthorized);
      }

      const body = ctx.body as Record<string, unknown>;
      const post = await svc.getPost(ctx.params.id);
      if (!post) {
        return jsonError("Post not found", HttpStatus.NotFound);
      }
      if (post.author_id !== userId && userRole !== "admin") {
        return jsonError("Forbidden", HttpStatus.Forbidden);
      }

      const updated = await svc.updatePost(ctx.params.id, {
        title: body.title as string | undefined,
        body: body.body as string | undefined,
        visibility: body.visibility as any,
        status: body.status as any,
        category: body.category as string | undefined,
        tags: body.tags as string[] | undefined,
        metadata: body.metadata as Record<string, unknown> | undefined,
      });

      return { success: true, post: updated };
    })

    .delete("/api/blog/posts/:id", async (ctx: any) => {
      const { userId, userRole } = extractAuth(ctx);
      if (!userId) {
        return jsonError("Unauthorized", HttpStatus.Unauthorized);
      }

      const post = await svc.getPost(ctx.params.id);
      if (!post) {
        return jsonError("Post not found", HttpStatus.NotFound);
      }
      if (post.author_id !== userId && userRole !== "admin") {
        return jsonError("Forbidden", HttpStatus.Forbidden);
      }

      await svc.deletePost(ctx.params.id);
      return { success: true };
    })

    // ── Comments ─────────────────────────────────────────
    .post("/api/blog/posts/:id/comments", async (ctx: any) => {
      const { userId } = extractAuth(ctx);
      if (!userId) {
        return jsonError("Unauthorized", HttpStatus.Unauthorized);
      }

      const body = ctx.body as Record<string, unknown>;
      const commentBody = body.body as string | undefined;
      if (!commentBody) {
        return jsonError("body is required", HttpStatus.BadRequest);
      }

      const post = await svc.getPost(ctx.params.id);
      if (!post) {
        return jsonError("Post not found", HttpStatus.NotFound);
      }

      const comment = await svc.createComment({
        post_id: ctx.params.id,
        author_id: userId,
        body: commentBody,
      });

      return { success: true, comment };
    })

    .get("/api/blog/posts/:id/comments", async (ctx: any) => {
      const comments = await svc.listComments(ctx.params.id, {
        limit: ctx.query.limit ? Number(ctx.query.limit) : undefined,
        offset: ctx.query.offset ? Number(ctx.query.offset) : undefined,
      });
      return { success: true, comments, count: comments.length };
    })

    // ── Moderation ───────────────────────────────────────
    .patch("/api/blog/comments/:id/moderate", async (ctx: any) => {
      const { userRole } = extractAuth(ctx);
      if (userRole !== "admin") {
        return jsonError("Admin access required", HttpStatus.Forbidden);
      }

      const body = ctx.body as Record<string, unknown>;
      const status = body.status as string | undefined;
      if (!status || !["visible", "hidden", "deleted"].includes(status)) {
        return jsonError(
          "status must be visible, hidden, or deleted",
          HttpStatus.BadRequest,
        );
      }

      const ok = await svc.moderateComment(ctx.params.id, status as any);
      if (!ok) {
        return jsonError("Comment not found", HttpStatus.NotFound);
      }
      return { success: true };
    })

    .patch("/api/blog/posts/:id/moderate", async (ctx: any) => {
      const { userRole } = extractAuth(ctx);
      if (userRole !== "admin") {
        return jsonError("Admin access required", HttpStatus.Forbidden);
      }

      const body = ctx.body as Record<string, unknown>;
      const status = body.status as string | undefined;
      if (
        !status ||
        !["draft", "published", "hidden", "disabled"].includes(status)
      ) {
        return jsonError(
          "status must be draft, published, hidden, or disabled",
          HttpStatus.BadRequest,
        );
      }

      const updated = await svc.updatePost(ctx.params.id, {
        status: status as any,
      });
      if (!updated) {
        return jsonError("Post not found", HttpStatus.NotFound);
      }
      return { success: true, post: updated };
    })

    // ── Follows ──────────────────────────────────────────
    .post("/api/blog/follow/:authorId", async (ctx: any) => {
      const { userId } = extractAuth(ctx);
      if (!userId) {
        return jsonError("Unauthorized", HttpStatus.Unauthorized);
      }

      await svc.follow(userId, ctx.params.authorId);
      return { success: true };
    })

    .delete("/api/blog/follow/:authorId", async (ctx: any) => {
      const { userId } = extractAuth(ctx);
      if (!userId) {
        return jsonError("Unauthorized", HttpStatus.Unauthorized);
      }

      await svc.unfollow(userId, ctx.params.authorId);
      return { success: true };
    })

    .get("/api/blog/follow/:authorId/status", async (ctx: any) => {
      const { userId } = extractAuth(ctx);
      if (!userId) {
        return jsonError("Unauthorized", HttpStatus.Unauthorized);
      }

      const following = await svc.isFollowing(userId, ctx.params.authorId);
      return { success: true, following };
    })

    .get("/api/blog/authors/:authorId/followers", async (ctx: any) => {
      const followers = await svc.getFollowers(ctx.params.authorId);
      return { success: true, followers, count: followers.length };
    })

    // ── RAG Sources ──────────────────────────────────────
    .get("/api/blog/posts/:id/sources", async (ctx: any) => {
      const sources = await svc.getRAGSources(ctx.params.id);
      return { success: true, sources, count: sources.length };
    })

    .post("/api/blog/posts/:id/sources", async (ctx: any) => {
      const { userRole } = extractAuth(ctx);
      if (userRole !== "admin") {
        return jsonError("Admin access required", HttpStatus.Forbidden);
      }

      const body = ctx.body as Record<string, unknown>;
      const source = await svc.addRAGSource(ctx.params.id, {
        source_type: body.source_type as any,
        uri: body.uri as string,
        title: body.title as string,
        relevance_score: (body.relevance_score as number) ?? 0,
        snippet: (body.snippet as string) ?? "",
      });

      return { success: true, source };
    });
}
