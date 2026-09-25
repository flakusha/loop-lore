/**
 * Chat-branch DB helpers (FEAT-045).
 *
 * Split from `branches.ts` to keep the service under the file-size gate;
 * both helpers are Kysely-only and branch-table-specific.
 */
import { type Kysely, } from "kysely";
import type { DB, } from "../../db/schema";

/**
 * Walk `messages.parent_id` from `tipId` up to the root, returning
 * root-to-tip message ids. Bounded by `maxDepth` to defend against
 * pathological/cyclic trees.
 * @param db
 * @param chatId
 * @param tipId
 * @param maxDepth
 */
export async function walkMessagePath(
  db: Kysely<DB>,
  chatId: string,
  tipId: string,
  maxDepth = 1000,
): Promise<string[]> {
  const path: string[] = [];
  let current: string | null = tipId;
  let depth = 0;
  while (current !== null && depth < maxDepth) {
    const row = await db
      .selectFrom("messages",)
      .select(["id", "parent_id", "chat_id",],)
      .where("id", "=", current,)
      .executeTakeFirst();
    if (!row || row.chat_id !== chatId) { break; }
    path.push(row.id,);
    current = row.parent_id;
    depth += 1;
  }
  return path.reverse();
}

/**
 * Next auto-name: "Branch N" where N is the existing count + 1.
 * @param db
 * @param chatId
 */
export async function nextAutoName(db: Kysely<DB>, chatId: string,): Promise<string> {
  const row = await db
    .selectFrom("chat_branches",)
    .select((eb,) => eb.fn.count<number>("id",).as("n",))
    .where("chat_id", "=", chatId,)
    .executeTakeFirst();
  return `Branch ${Number(row?.n ?? 0,) + 1}`;
}
