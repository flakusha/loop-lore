// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 25

import { sql, } from "kysely";
import type { Kysely, } from "kysely";

/**
 * @param db
 * @param id
 */
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
