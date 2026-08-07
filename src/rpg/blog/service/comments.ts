import type { Kysely, } from "kysely";
import { notifyBlogComment, } from "../../../notifications/service";
import { uid, } from "../../../utils.js";
import type {
  BlogCommentRow,
  BlogCommentStatus,
  CreateCommentInput,
} from "./types";

// ── Comments ─────────────────────────────────────────
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
    .execute() as Promise<BlogCommentRow[]>;
}

export async function moderateComment(
  db: Kysely<any>,
  id: string,
  status: BlogCommentStatus,
): Promise<boolean> {
  const result = await db
    .updateTable("blog_comments",)
    .set({ status, },)
    .where("id", "=", id,)
    .executeTakeFirst();
  return Number(result?.numUpdatedRows ?? 0,) > 0;
}
