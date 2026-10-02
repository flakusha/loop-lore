/**
 * Chat-branch DB helpers (FEAT-045).
 *
 * Split from `branches.ts` to keep the service under the file-size gate;
 * both helpers are Kysely-only and branch-table-specific.
 */
import { type Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { checkChatAccess, } from "./access";
// hint: Logic and cosmetic changes overlap. Resolve logic first, then reformat.
import type { ChatBranchWithMeta, ListBranchesResult, } from "./branches";
import type { ServiceError, } from "./types";
/** Shared 404 for a branch row that is missing or owned by another chat. */
export const BRANCH_NOT_FOUND: ServiceError = {
  code: "not_found",
  message: "Branch not found in chat",
};

/**
 * Walk `messages.parent_id` from `tipId` up to the root, returning
 * root-to-tip message ids. Bounded by `maxDepth` to defend against
 * pathological/cyclic trees.
 * @param db
 * @param chatId
 * @param tipId
 * @param maxDepth
 * @returns {Promise<string[]>}
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
 * Next auto-name: "Branch N" where N is the existing count + 1, advanced by
 * `attempt` so a retry cannot land on the same taken label.
 *
 * The count read is unlocked, so two concurrent forks CAN compute the same
 * name; the `(chat_id, name)` UNIQUE index (migration 032) is the real
 * arbiter. Callers must retry the insert on a name conflict rather than trust
 * this value.
 * @param db
 * @param chatId
 * @param attempt
 * @returns {Promise<string>}
 */
export async function nextAutoName(
  db: Kysely<DB>,
  chatId: string,
  attempt = 0,
): Promise<string> {
  const row = await db
    .selectFrom("chat_branches",)
    .select((eb,) => eb.fn.count<number>("id",).as("n",))
    .where("chat_id", "=", chatId,)
    .executeTakeFirst();

  return `Branch ${Number(row?.n ?? 0,) + 1 + attempt}`;
}

/**
 * Resolve the message chain for a branch: walk from the branch tip
 * (parent_message_id) to the root. Returns root-to-tip message ids.
 * @param {Kysely<DB>} db
 * @param {string} chatId
 * @param {string} branchId
 * @param {string} actorId
 * @returns {Promise<string[]>}
 */
export async function getMessagesForBranch(
  db: Kysely<DB>,
  chatId: string,
  branchId: string,
  actorId: string,
): Promise<string[]> {
  const access = await checkChatAccess(db, chatId, actorId, null,);
  if (!access.ok) { return []; }
  const branch = await db
    .selectFrom("chat_branches",)
    .select(["chat_id", "parent_message_id",],)
    .where("id", "=", branchId,)
    .executeTakeFirst();
  if (!branch || branch.chat_id !== chatId) { return []; }
  return walkMessagePath(db, chatId, branch.parent_message_id,);
}

/**
 * List all branches in a chat with computed metadata. Caller must have
 * chat access (owner/participant/admin). `isActive` mirrors the per-row
 * `is_active` flag; the displayed branch equals `chats.active_branch_id`.
 * @param db
 * @param chatId
 * @param actorId
 * @returns {Promise<ListBranchesResult>}
 */
export async function listBranches(
  db: Kysely<DB>,
  chatId: string,
  actorId: string,
): Promise<ListBranchesResult> {
  const access = await checkChatAccess(db, chatId, actorId, null,);
  if (!access.ok) { return access.error; }

  const rows = await db
    .selectFrom("chat_branches",)
    .selectAll()
    .where("chat_id", "=", chatId,)
    .orderBy("created_at", "asc",)
    .execute();

  const out: ChatBranchWithMeta[] = [];
  for (const row of rows) {
    out.push(await withMeta(db, chatId, row,),);
  }
  return { ok: true, branches: out, };
}

// ── FEAT-046: shared branch-row helpers ───────────────────────

/** Columns of `chat_branches` the navigation API reads. */
export interface BranchRow {
  id: string;
  chat_id: string;
  parent_message_id: string;
  name: string;
  created_at: string;
  is_active: number;
}

/**
 * Load a branch row, or null when it is missing or owned by another chat.
 * @param db
 * @param chatId
 * @param branchId
 * @returns {Promise<BranchRow | null>}
 */
export async function loadBranch(
  db: Kysely<DB>,
  chatId: string,
  branchId: string,
): Promise<BranchRow | null> {
  const row = await db
    .selectFrom("chat_branches",)
    .selectAll()
    .where("id", "=", branchId,)
    .executeTakeFirst();

  return row && row.chat_id === chatId ? row : null;
}

/**
 * Actor-scoped branch access: the chat guard runs FIRST, so `run` can never
 * probe or mutate a branch in a chat the actor cannot see.
 * @param db
 * @param params
 * @param params.chatId
 * @param params.branchId
 * @param params.actorId
 * @param run
 * @returns {Promise<R | ServiceError>}
 */
export async function withBranch<R extends object,>(
  db: Kysely<DB>,
  params: { chatId: string; branchId: string; actorId: string },
  run: (row: BranchRow,) => Promise<R>,
): Promise<R | ServiceError> {
  const { chatId, branchId, actorId, } = params;
  const access = await checkChatAccess(db, chatId, actorId, null,);
  if (!access.ok) { return access.error; }
  const row = await loadBranch(db, chatId, branchId,);
  if (!row) { return BRANCH_NOT_FOUND; }
  return run(row,);
}

/**
 * The chat's displayed branch pointer, or null when it was never populated
 * (chats that forked before the column existed).
 * @param db
 * @param chatId
 * @returns {Promise<string | null>}
 */
export async function activeBranchId(db: Kysely<DB>, chatId: string,): Promise<string | null> {
  const chat = await db
    .selectFrom("chats",)
    .select(["active_branch_id",],)
    .where("id", "=", chatId,)
    .executeTakeFirst();

  return chat?.active_branch_id ?? null;
}

/**
 * Point the chat's displayed branch at `branchId`. Runs through the caller's
 * executor so it can join an existing transaction; fork and switch both keep
 * `chats.active_branch_id` in lockstep with the per-row `is_active` flags.
 * @param db
 * @param chatId
 * @param branchId
 * @returns {Promise<void>}
 */
export async function setActiveBranchId(
  db: Kysely<DB>,
  chatId: string,
  branchId: string,
): Promise<void> {
  await db
    .updateTable("chats",)
    .set({ active_branch_id: branchId, },)
    .where("id", "=", chatId,)
    .execute();
}

/**
 * Decorate a row with walk-derived metadata (message count + last activity).
 * @param db
 * @param chatId
 * @param row
 * @returns {Promise<ChatBranchWithMeta>}
 */
export async function withMeta(
  db: Kysely<DB>,
  chatId: string,
  row: BranchRow,
): Promise<ChatBranchWithMeta> {
  const tipRow = await db
    .selectFrom("messages",)
    .select(["created_at",],)
    .where("id", "=", row.parent_message_id,)
    .executeTakeFirst();

  const path = await walkMessagePath(db, chatId, row.parent_message_id,);
  return {
    id: row.id,
    chatId: row.chat_id,
    parentMessageId: row.parent_message_id,
    name: row.name,
    createdAt: row.created_at,
    isActive: Number(row.is_active,) === 1,
    messageCount: path.length,
    lastActivity: tipRow?.created_at ?? null,
  };
}
