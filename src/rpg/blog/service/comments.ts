// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { notifyBlogComment, } from "../../../notifications/service";
import { can, } from "../../../users/permissions";
import { uid, } from "../../../utils.js";
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
 * @returns {Promise<BlogCommentRow>}
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
 * @returns {Promise<BlogCommentRow[]>}
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
 * @returns {Promise<BlogCommentWithChildren[]>}
 */
export async function listCommentsThreaded(
  db: Kysely<any>,
  postId: string,
  opts?: { limit?: number; offset?: number },
): Promise<BlogCommentWithChildren[]> {
  // Page over the ROOT comments only. The flat list interleaves a root with
  // its replies, so paging it split a thread across pages: the root came
  // back on one page and its replies on another (or on no page at all).
  const roots = await db
    .selectFrom("blog_comments",)
    .selectAll()
    .where("post_id", "=", postId,)
    .where("status", "!=", "deleted",)
    .where("parent_comment_id", "is", null,)
    .orderBy("created_at", "asc",)
    .limit(opts?.limit ?? 50,)
    .offset(opts?.offset ?? 0,)
    .execute() as unknown as BlogCommentRow[];

  if (roots.length === 0) { return []; }

  const rootIds = roots.map((root,) => root.id);

  // Every descendant of those roots, in one recursive query.
  const descendants = await db
    .withRecursive("thread", (cte,) =>
      cte
        .selectFrom("blog_comments",)
        .select(["id", "post_id", "author_id", "body", "status", "created_at", "parent_comment_id",],)
        .where("post_id", "=", postId,)
        .where("status", "!=", "deleted",)
        .where("parent_comment_id", "in", rootIds,)
        .unionAll(
          cte
            .selectFrom("blog_comments",)
            .innerJoin("thread", "thread.id", "blog_comments.parent_comment_id",)
            .select([
              "blog_comments.id",
              "blog_comments.post_id",
              "blog_comments.author_id",
              "blog_comments.body",
              "blog_comments.status",
              "blog_comments.created_at",
              "blog_comments.parent_comment_id",
            ],)
            .where("blog_comments.post_id", "=", postId,)
            .where("blog_comments.status", "!=", "deleted",),
        ),)
    .selectFrom("thread",)
    .selectAll()
    .orderBy("created_at", "asc",)
    .execute() as unknown as BlogCommentRow[];

  const childrenByParent = new Map<string, BlogCommentRow[]>();

  for (const comment of descendants) {
    const parentId = comment.parent_comment_id;
    if (parentId === null || parentId === undefined) { continue; }
    const siblings = childrenByParent.get(parentId,);
    if (siblings) {
      siblings.push(comment,);
    } else {
      childrenByParent.set(parentId, [comment,],);
    }
  }

  function buildTree(parentId: string,): BlogCommentWithChildren[] {
    const siblings = childrenByParent.get(parentId,) ?? [];
    return siblings.map((c,) => ({
      ...c,
      children: buildTree(c.id,),
    }));
  }

  return roots.map((root,) => ({
    ...root,
    children: buildTree(root.id,),
  }));
}

/**
 * @param db
 * @param id
 * @returns {Promise<BlogCommentRow | undefined>}
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
 * @returns {Promise<boolean>}
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
