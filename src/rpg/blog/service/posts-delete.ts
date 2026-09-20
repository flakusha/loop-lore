// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";

/**
 * @param db
 * @param id
 * @param callerUserId authenticated user id performing the mutation
 * @param isAdmin       whether the caller may delete any author's post
 */
export async function deletePost(
  db: Kysely<any>,
  id: string,
  callerUserId: string,
  isAdmin = false,
): Promise<boolean> {
  const owner = await db
    .selectFrom("blog_posts",)
    .select("author_id",)
    .where("id", "=", id,)
    .executeTakeFirst();
  if (!owner || (owner.author_id !== callerUserId && !isAdmin)) { return false; }

  const result = await db
    .deleteFrom("blog_posts",)
    .where("id", "=", id,)
    .executeTakeFirst();
  return Number(result?.numDeletedRows ?? 0,) > 0;
}
