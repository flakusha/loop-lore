import type { Kysely, } from "kysely";
import { sql, } from "kysely";
import { notifyBlogPost, } from "../../../notifications/service";
import { jsonStringifyOr, uid, } from "../../../utils.js";
import { addTags, clearTags, getTags, } from "./tags";
import {
  BlogAuthorType,
  type BlogPostRow,
  BlogPostStatus,
  BlogPostVisibility,
  type BlogPostWithTags,
  type CreateBlogPostInput,
  type UpdateBlogPostInput,
} from "./types";

// ── Posts ────────────────────────────────────────────
export async function createPost(
  db: Kysely<any>,
  input: CreateBlogPostInput,
): Promise<BlogPostRow> {
  const id = uid();
  const now = new Date().toISOString();
  const post = {
    id,
    author_id: input.author_id,
    title: input.title,
    body: input.body,
    visibility: input.visibility ?? BlogPostVisibility.Public,
    author_type: input.author_type ?? BlogAuthorType.Human,
    status: input.scheduled_at
      ? BlogPostStatus.Scheduled
      : BlogPostStatus.Draft,
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

  await db.insertInto("blog_posts",).values(post,).execute();
  // Notify followers of new post
  if (post.visibility === BlogPostVisibility.Public || post.visibility === BlogPostVisibility.Followers) {
    const followers = await db
      .selectFrom("blog_follows",)
      .select("follower_id",)
      .where("author_id", "=", post.author_id,)
      .execute();
    for (const f of followers) {
      if (f.follower_id === post.author_id) { continue; }
      await notifyBlogPost(db, {
        userId: f.follower_id,
        postId: post.id,
        title: post.title,
      },);
    }
  }

  if (input.tags?.length) {
    await addTags(db, id, input.tags,);
  }

  return post;
}

export async function getPost(
  db: Kysely<any>,
  id: string,
): Promise<BlogPostWithTags | undefined> {
  const row = (await db
    .selectFrom("blog_posts",)
    .selectAll()
    .where("id", "=", id,)
    .executeTakeFirst()) as BlogPostRow | undefined;

  if (!row) { return undefined; }

  const tags = await getTags(db, id,);
  return { ...row, tags, };
}

export async function listPosts(
  db: Kysely<any>,
  filters: {
    author_id?: string;
    visibility?: BlogPostVisibility;
    status?: BlogPostStatus;
    category?: string;
    world_id?: string;
    limit?: number;
    offset?: number;
  },
): Promise<BlogPostWithTags[]> {
  let query = db.selectFrom("blog_posts",).selectAll();

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
  const postIds = Array.from(rows, (r,) => r.id,);
  const tagRows = (await db
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

  return Array.from(rows, (row,) => ({
    ...row,
    tags: tagsByPost.get(row.id,) ?? [],
  }),);
}

export async function updatePost(
  db: Kysely<any>,
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
    if (input.status === BlogPostStatus.Published) {
      updates.published_at = new Date().toISOString();
    }
  }
  if (input.category !== undefined) { updates.category = input.category; }
  if (input.metadata !== undefined) {
    updates.metadata = jsonStringifyOr(input.metadata,);
  }

  const result = await db
    .updateTable("blog_posts",)
    .set(updates,)
    .where("id", "=", id,)
    .executeTakeFirst();

  if (Number(result?.numUpdatedRows ?? 0,) === 0) { return undefined; }

  if (input.tags !== undefined) {
    await clearTags(db, id,);
    if (input.tags.length > 0) {
      await addTags(db, id, input.tags,);
    }
  }

  return getPost(db, id,);
}

export async function deletePost(db: Kysely<any>, id: string,): Promise<boolean> {
  const result = await db
    .deleteFrom("blog_posts",)
    .where("id", "=", id,)
    .executeTakeFirst();
  return Number(result?.numDeletedRows ?? 0,) > 0;
}

export async function incrementViewCount(
  db: Kysely<any>,
  id: string,
): Promise<void> {
  await db
    .updateTable("blog_posts",)
    .set({ view_count: sql`COALESCE(view_count, 0) + 1`, },)
    .where("id", "=", id,)
    .execute();
}
