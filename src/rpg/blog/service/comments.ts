// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { notifyBlogComment, } from "../../../notifications/service";
import { uid, } from "../../../utils.js";
import { can, } from "../../../users/permissions";
import type {
  BlogCommentRow,
  BlogCommentStatus,
  BlogCommentWithChildren,
  CreateCommentInput,
} from "./types";

// ── Comments ─────────────────────────────────────────
/**
 * @param db
 * @param input
 */
export async function createComment(
  db: Kysely<any>,
  input: CreateCommentInput,
): Promise<BlogCommentRow> {
  const id = uid();
  const comment = {
    id,
    post_id: input.post_id,
    author_id: input.author_id,
    body: input.body,
    status: "visible" as const,
    parent_comment_id: input.parent_comment_id ?? null,
    created_at: new Date().toISOString(),
  };

  await db.insertInto("blog_comments",).values(comment,).execute();
  // Notify post author of new comment
  const post = await db
    .selectFrom("blog_posts",)
    .select(["author_id", "title",],)
    .where("id", "=", comment.post_id,)
    .executeTakeFirst();
  if (post && post.author_id !== comment.author_id) {
    const commenter = await db
      .selectFrom("actors",)
      .select("display_name",)
      .where("id", "=", comment.author_id,)
      .executeTakeFirst();
    await notifyBlogComment(db, {
      userId: post.author_id,
      postId: comment.post_id,
      commenterName: commenter?.display_name ?? "Someone",
    },);
  }

  return comment;
}

/**
 * @param db
 * @param postId
 * @param opts
 * @param opts.limit
 * @param opts.offset
 */
export async function listComments(
  db: Kysely<any>,
  postId: string,
  opts?: { limit?: number; offset?: number },
): Promise<BlogCommentRow[]> {
  return db
    .selectFrom("blog_comments",)
    .selectAll()
    .where("post_id", "=", postId,)
    .where("status", "!=", "deleted",)
    .orderBy("created_at", "asc",)
    .limit(opts?.limit ?? 50,)
    .offset(opts?.offset ?? 0,)
    .execute() as unknown as BlogCommentRow[];
}

/**
 * @param db
 * @param postId
 * @param opts
 * @param opts.limit
 * @param opts.offset
 */
export async function listCommentsThreaded(
  db: Kysely<any>,
  postId: string,
  opts?: { limit?: number; offset?: number },
): Promise<BlogCommentWithChildren[]> {
  const comments = await db
    .selectFrom("blog_comments",)
    .selectAll()
    .where("post_id", "=", postId,)
    .where("status", "!=", "deleted",)
    .orderBy("created_at", "asc",)
    .limit(opts?.limit ?? 50,)
    .offset(opts?.offset ?? 0,)
    .execute() as unknown as BlogCommentRow[];

  // Build a lookup map keyed by id
  const byId = new Map<string, BlogCommentRow[]>();

  for (const c of comments) {
    const key = c.parent_comment_id ?? "__root__";
    const arr = byId.get(key,);
    if (arr) {
      arr.push(c,);
    } else {
      byId.set(key, [c,],);
    }
  }

  function buildTree(parentId: string | null,): BlogCommentWithChildren[] {
    const key = parentId ?? "__root__";
    const siblings = byId.get(key,) ?? [];
    return siblings.map((c,) => ({
      ...c,
      children: buildTree(c.id,),
    }));
  }

  return buildTree(null,);
}

/**
 * @param db
 * @param id
 */
export async function getComment(
  db: Kysely<any>,
  id: string,
): Promise<BlogCommentRow | undefined> {
  return db
    .selectFrom("blog_comments",)
    .selectAll()
    .where("id", "=", id,)
    .where("status", "!=", "deleted",)
    .executeTakeFirst() as unknown as BlogCommentRow | undefined;
}

/**
 * Caller context for blog moderation. Authorization gate lives at the
 * service layer so any future caller (route, RPC, console script) cannot
 * silently bypass it.
 */
export interface ModerateCaller {
  /** User id of the actor attempting the moderation. */
  userId: string;
  /** Role string (admin, moderator, user, ...). */
  role: string | null;
}

/**
 * @param db
 * @param id
 * @param status
 * @param caller
 */
export async function moderateComment(
  db: Kysely<any>,
  id: string,
  status: BlogCommentStatus,
  caller: ModerateCaller,
): Promise<boolean> {
  // Resolve the comment + post author so a non-moderator caller (post owner
  // or comment author) may moderate their own content.
  const comment = await db
    .selectFrom("blog_comments",)
    .innerJoin("blog_posts", "blog_posts.id", "blog_comments.post_id",)
    .select([
      "blog_comments.id as id",
      "blog_comments.author_id as comment_author_id",
      "blog_posts.author_id as post_author_id",
    ],)
    .where("blog_comments.id", "=", id,)
    .executeTakeFirst();
  if (!comment) { return false; }

  const isModerator = can(caller.role, "moderation.action",);
  const isPostAuthor = comment.post_author_id === caller.userId;
  const isCommentAuthor = comment.comment_author_id === caller.userId;
  if (!isModerator && !isPostAuthor && !isCommentAuthor) { return false; }

  const result = await db
    .updateTable("blog_comments",)
    .set({ status, },)
    .where("id", "=", id,)
    .executeTakeFirst();
  return Number(result?.numUpdatedRows ?? 0,) > 0;
}
