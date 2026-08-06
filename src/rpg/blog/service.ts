/**
 * Blog Service — Post, comment, follow, and RAG source management.
 *
 * Supports both human-authored and LLM-authored posts with
 * visibility tiers (public/followers/private), moderation status,
 * tag management, and RAG source tracking.
 */
import type { Kysely, } from "kysely";
import { sql, } from "kysely";
import { notifyBlogComment, notifyBlogPost, } from "../../notifications/service.js";
import { jsonStringifyOr, uid, } from "../../utils.js";

// ── Types ────────────────────────────────────────────────
export type BlogPostVisibility = "public" | "followers" | "private";
export type BlogPostStatus =
  | "draft"
  | "published"
  | "hidden"
  | "disabled"
  | "scheduled";
export type BlogAuthorType = "human" | "llm";
export type BlogCommentStatus = "visible" | "hidden" | "deleted";
export type BlogRAGSourceType =
  | "internal_rag"
  | "external_web"
  | "external_api";

export interface BlogPostRow {
  id: string;
  author_id: string;
  title: string;
  body: string;
  visibility: BlogPostVisibility;
  author_type: BlogAuthorType;
  status: BlogPostStatus;
  category: string | null;
  world_id: string | null;
  character_id: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  view_count: number;
  metadata: string;
  created_at: string;
  updated_at: string;
}

export interface BlogCommentRow {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  status: BlogCommentStatus;
  created_at: string;
}

export interface BlogTagRow {
  id: string;
  post_id: string;
  tag: string;
}

export interface BlogFollowRow {
  id: string;
  follower_id: string;
  author_id: string;
  created_at: string;
}

export interface BlogRAGSourceRow {
  id: string;
  post_id: string;
  source_type: BlogRAGSourceType;
  uri: string;
  title: string;
  relevance_score: number;
  snippet: string;
  created_at: string;
}

export interface CreateBlogPostInput {
  author_id: string;
  title: string;
  body: string;
  visibility?: BlogPostVisibility;
  author_type?: BlogAuthorType;
  category?: string;
  world_id?: string;
  character_id?: string;
  tags?: string[];
  scheduled_at?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateBlogPostInput {
  title?: string;
  body?: string;
  visibility?: BlogPostVisibility;
  status?: BlogPostStatus;
  category?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface CreateCommentInput {
  post_id: string;
  author_id: string;
  body: string;
}

export interface BlogPostWithTags extends BlogPostRow {
  tags: string[];
}

// ── Service ──────────────────────────────────────────────
export class BlogService {
  constructor(private readonly db: Kysely<any>,) {}

  // ── Posts ────────────────────────────────────────────
  async createPost(input: CreateBlogPostInput,): Promise<BlogPostRow> {
    const id = uid();
    const now = new Date().toISOString();
    const post = {
      id,
      author_id: input.author_id,
      title: input.title,
      body: input.body,
      visibility: input.visibility ?? ("public" as const),
      author_type: input.author_type ?? ("human" as const),
      status: input.scheduled_at
        ? ("scheduled" as const)
        : ("draft" as const),
      category: input.category ?? null,
      world_id: input.world_id ?? null,
      character_id: input.character_id ?? null,
      scheduled_at: input.scheduled_at ?? null,
      published_at: null as string | null,
      view_count: 0,
      metadata: jsonStringifyOr(input.metadata ?? {},),
      created_at: now,
      updated_at: now,
    };

    await this.db.insertInto("blog_posts",).values(post,).execute();
    // Notify followers of new post
    if (post.visibility === "public" || post.visibility === "followers") {
      const followers = await this.db
        .selectFrom("blog_follows",)
        .select("follower_id",)
        .where("author_id", "=", post.author_id,)
        .execute();
      for (const f of followers) {
        if (f.follower_id === post.author_id) { continue; }
        await notifyBlogPost(this.db, {
          userId: f.follower_id,
          postId: post.id,
          title: post.title,
        },);
      }
    }

    if (input.tags?.length) {
      await this.addTags(id, input.tags,);
    }

    return post;
  }

  async getPost(id: string,): Promise<BlogPostWithTags | undefined> {
    const row = (await this.db
      .selectFrom("blog_posts",)
      .selectAll()
      .where("id", "=", id,)
      .executeTakeFirst()) as BlogPostRow | undefined;

    if (!row) { return undefined; }

    const tags = await this.getTags(id,);
    return { ...row, tags, };
  }

  async listPosts(filters: {
    author_id?: string;
    visibility?: BlogPostVisibility;
    status?: BlogPostStatus;
    category?: string;
    world_id?: string;
    limit?: number;
    offset?: number;
  },): Promise<BlogPostWithTags[]> {
    let query = this.db.selectFrom("blog_posts",).selectAll();

    if (filters.author_id) {
      query = query.where("author_id", "=", filters.author_id,);
    }
    if (filters.visibility) {
      query = query.where("visibility", "=", filters.visibility,);
    }
    if (filters.status) {
      query = query.where("status", "=", filters.status,);
    }
    if (filters.category) {
      query = query.where("category", "=", filters.category,);
    }
    if (filters.world_id) {
      query = query.where("world_id", "=", filters.world_id,);
    }

    query = query
      .orderBy("created_at", "desc",)
      .limit(filters.limit ?? 20,)
      .offset(filters.offset ?? 0,);

    const rows = (await query.execute()) as BlogPostRow[];
    if (rows.length === 0) { return []; }

    // Batch-fetch tags to avoid N+1
    const postIds = rows.map((r,) => r.id);
    const tagRows = (await this.db
      .selectFrom("blog_tags",)
      .select(["post_id", "tag",],)
      .where("post_id", "in", postIds,)
      .execute()) as { post_id: string; tag: string }[];

    const tagsByPost = new Map<string, string[]>();
    for (const tr of tagRows) {
      const arr = tagsByPost.get(tr.post_id,) ?? [];
      arr.push(tr.tag,);
      tagsByPost.set(tr.post_id, arr,);
    }

    return rows.map((row,) => ({
      ...row,
      tags: tagsByPost.get(row.id,) ?? [],
    }));
  }

  async updatePost(
    id: string,
    input: UpdateBlogPostInput,
  ): Promise<BlogPostRow | undefined> {
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (input.title !== undefined) { updates.title = input.title; }
    if (input.body !== undefined) { updates.body = input.body; }
    if (input.visibility !== undefined) { updates.visibility = input.visibility; }
    if (input.status !== undefined) {
      updates.status = input.status;
      if (input.status === "published") {
        updates.published_at = new Date().toISOString();
      }
    }
    if (input.category !== undefined) { updates.category = input.category; }
    if (input.metadata !== undefined) {
      updates.metadata = jsonStringifyOr(input.metadata,);
    }

    const result = await this.db
      .updateTable("blog_posts",)
      .set(updates,)
      .where("id", "=", id,)
      .executeTakeFirst();

    if (Number(result?.numUpdatedRows ?? 0,) === 0) { return undefined; }

    if (input.tags !== undefined) {
      await this.clearTags(id,);
      if (input.tags.length > 0) {
        await this.addTags(id, input.tags,);
      }
    }

    return this.getPost(id,);
  }

  async deletePost(id: string,): Promise<boolean> {
    const result = await this.db
      .deleteFrom("blog_posts",)
      .where("id", "=", id,)
      .executeTakeFirst();
    return Number(result?.numDeletedRows ?? 0,) > 0;
  }

  async incrementViewCount(id: string,): Promise<void> {
    await this.db
      .updateTable("blog_posts",)
      .set({ view_count: sql`COALESCE(view_count, 0) + 1`, },)
      .where("id", "=", id,)
      .execute();
  }

  // ── Comments ─────────────────────────────────────────
  async createComment(input: CreateCommentInput,): Promise<BlogCommentRow> {
    const id = uid();
    const comment = {
      id,
      post_id: input.post_id,
      author_id: input.author_id,
      body: input.body,
      status: "visible" as const,
      created_at: new Date().toISOString(),
    };

    await this.db.insertInto("blog_comments",).values(comment,).execute();
    // Notify post author of new comment
    const post = await this.db
      .selectFrom("blog_posts",)
      .select(["author_id", "title",],)
      .where("id", "=", comment.post_id,)
      .executeTakeFirst();
    if (post && post.author_id !== comment.author_id) {
      const commenter = await this.db
        .selectFrom("actors",)
        .select("display_name",)
        .where("id", "=", comment.author_id,)
        .executeTakeFirst();
      await notifyBlogComment(this.db, {
        userId: post.author_id,
        postId: comment.post_id,
        commenterName: commenter?.display_name ?? "Someone",
      },);
    }

    return comment;
  }

  async listComments(
    postId: string,
    opts?: { limit?: number; offset?: number },
  ): Promise<BlogCommentRow[]> {
    return this.db
      .selectFrom("blog_comments",)
      .selectAll()
      .where("post_id", "=", postId,)
      .where("status", "!=", "deleted",)
      .orderBy("created_at", "asc",)
      .limit(opts?.limit ?? 50,)
      .offset(opts?.offset ?? 0,)
      .execute() as Promise<BlogCommentRow[]>;
  }

  async moderateComment(
    id: string,
    status: BlogCommentStatus,
  ): Promise<boolean> {
    const result = await this.db
      .updateTable("blog_comments",)
      .set({ status, },)
      .where("id", "=", id,)
      .executeTakeFirst();
    return Number(result?.numUpdatedRows ?? 0,) > 0;
  }

  // ── Follows ──────────────────────────────────────────
  async follow(
    followerId: string,
    authorId: string,
  ): Promise<BlogFollowRow> {
    const follow = {
      id: uid(),
      follower_id: followerId,
      author_id: authorId,
      created_at: new Date().toISOString(),
    };

    await this.db.insertInto("blog_follows",).values(follow,).execute();
    return follow;
  }

  async unfollow(
    followerId: string,
    authorId: string,
  ): Promise<boolean> {
    const result = await this.db
      .deleteFrom("blog_follows",)
      .where("follower_id", "=", followerId,)
      .where("author_id", "=", authorId,)
      .executeTakeFirst();
    return Number(result?.numDeletedRows ?? 0,) > 0;
  }

  async getFollowers(authorId: string,): Promise<string[]> {
    const rows = await this.db
      .selectFrom("blog_follows",)
      .select("follower_id",)
      .where("author_id", "=", authorId,)
      .execute();
    return rows.map((r: any,) => r.follower_id as string);
  }

  async isFollowing(
    followerId: string,
    authorId: string,
  ): Promise<boolean> {
    const row = await this.db
      .selectFrom("blog_follows",)
      .select("id",)
      .where("follower_id", "=", followerId,)
      .where("author_id", "=", authorId,)
      .executeTakeFirst();
    return !!row;
  }

  async getFollowStatus(
    followerId: string,
    authorId: string,
  ): Promise<{ following: boolean }> {
    return { following: await this.isFollowing(followerId, authorId,), };
  }

  // ── RAG Sources ──────────────────────────────────────
  async addRAGSource(
    postId: string,
    source: Omit<BlogRAGSourceRow, "id" | "created_at" | "post_id">,
  ): Promise<BlogRAGSourceRow> {
    const row = {
      id: uid(),
      post_id: postId,
      source_type: source.source_type,
      uri: source.uri,
      title: source.title,
      relevance_score: source.relevance_score,
      snippet: source.snippet,
      created_at: new Date().toISOString(),
    };

    await this.db.insertInto("blog_rag_sources",).values(row,).execute();
    return row;
  }

  async getRAGSources(postId: string,): Promise<BlogRAGSourceRow[]> {
    return this.db
      .selectFrom("blog_rag_sources",)
      .selectAll()
      .where("post_id", "=", postId,)
      .orderBy("relevance_score", "desc",)
      .execute() as Promise<BlogRAGSourceRow[]>;
  }

  // ── Tags (internal) ──────────────────────────────────
  private async addTags(postId: string, tags: string[],): Promise<void> {
    const rows = tags.map((tag,) => ({
      id: uid(),
      post_id: postId,
      tag: tag.trim().toLowerCase(),
    }));
    await this.db.insertInto("blog_tags",).values(rows,).execute();
  }

  private async clearTags(postId: string,): Promise<void> {
    await this.db
      .deleteFrom("blog_tags",)
      .where("post_id", "=", postId,)
      .execute();
  }

  private async getTags(postId: string,): Promise<string[]> {
    const rows = await this.db
      .selectFrom("blog_tags",)
      .select("tag",)
      .where("post_id", "=", postId,)
      .execute();
    return rows.map((r: any,) => r.tag as string);
  }
}
