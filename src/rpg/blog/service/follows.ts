// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { uid, } from "../../../utils.js";
import type { BlogFollowRow, } from "./types";

// ── Follows ──────────────────────────────────────────
export async function follow(
  db: Kysely<any>,
  followerId: string,
  authorId: string,
): Promise<BlogFollowRow> {
  const follow = {
    id: uid(),
    follower_id: followerId,
    author_id: authorId,
    created_at: new Date().toISOString(),
  };

  await db.insertInto("blog_follows",).values(follow,).execute();
  return follow;
}

export async function unfollow(
  db: Kysely<any>,
  followerId: string,
  authorId: string,
): Promise<boolean> {
  const result = await db
    .deleteFrom("blog_follows",)
    .where("follower_id", "=", followerId,)
    .where("author_id", "=", authorId,)
    .executeTakeFirst();
  return Number(result?.numDeletedRows ?? 0,) > 0;
}

export async function getFollowers(
  db: Kysely<any>,
  authorId: string,
): Promise<string[]> {
  const rows = await db
    .selectFrom("blog_follows",)
    .select("follower_id",)
    .where("author_id", "=", authorId,)
    .execute();
  return Array.from(rows, (r: any,) => r.follower_id as string,);
}

export async function isFollowing(
  db: Kysely<any>,
  followerId: string,
  authorId: string,
): Promise<boolean> {
  const row = await db
    .selectFrom("blog_follows",)
    .select("id",)
    .where("follower_id", "=", followerId,)
    .where("author_id", "=", authorId,)
    .executeTakeFirst();
  return !!row;
}

export async function getFollowStatus(
  db: Kysely<any>,
  followerId: string,
  authorId: string,
): Promise<{ following: boolean }> {
  return { following: await isFollowing(db, followerId, authorId,), };
}
