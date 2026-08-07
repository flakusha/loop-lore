import type { Kysely, } from "kysely";
import { uid, } from "../../../utils.js";

// ── Tags (internal) ──────────────────────────────────────
export async function addTags(
  db: Kysely<any>,
  postId: string,
  tags: string[],
): Promise<void> {
  const rows = Array.from(tags, (tag,) => ({
    id: uid(),
    post_id: postId,
    tag: tag.trim().toLowerCase(),
  }),);
  await db.insertInto("blog_tags",).values(rows,).execute();
}

export async function clearTags(db: Kysely<any>, postId: string,): Promise<void> {
  await db
    .deleteFrom("blog_tags",)
    .where("post_id", "=", postId,)
    .execute();
}

export async function getTags(db: Kysely<any>, postId: string,): Promise<string[]> {
  const rows = await db
    .selectFrom("blog_tags",)
    .select("tag",)
    .where("post_id", "=", postId,)
    .execute();
  return Array.from(rows, (r: any,) => r.tag as string,);
}
