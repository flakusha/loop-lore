// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Ren'Py export gather — DB reads ( chats, messages, branches, participants,
 * actors, avatars ) into the normalized export model. The active branch sets
 * the played path; sibling branches sharing a fork point become menu stubs.
 * Throws on unreadable chats; each chat resolves its own speakers.
 */
import { type Kysely, } from "kysely";
import type { DB, } from "../../../src/db/schema";
import { slugify, uniqueSlugs, } from "./script";
import type { RenpyCharacter, RenpyExportChat, RenpyExportForkStub, RenpyExportMessage, RenpyExportModel, } from "./types";

/** Input for {@link gatherExportModel}. */
export interface GatherExportOptions {
  chatIds: string[];
}

interface ChatRow {
  id: string;
  name: string;
  active_branch_id: string | null;
}

interface MessageRow {
  id: string;
  actor_id: string;
  parent_id: string | null;
  role: string;
  content: string;
}

interface BranchRow {
  id: string;
  parent_message_id: string;
  name: string;
}

async function loadChat(db: Kysely<DB>, chatId: string,): Promise<ChatRow> {
  const row = await db
    .selectFrom("chats",)
    .select(["id", "name", "active_branch_id",],)
    .where("id", "=", chatId,)
    .executeTakeFirst();
  if (!row) { throw new Error(`chat not found: ${chatId}`,); }
  return { id: row.id, name: row.name, active_branch_id: row.active_branch_id, };
}

async function chatMessageIds(db: Kysely<DB>, chat: ChatRow,): Promise<string[]> {
  if (chat.active_branch_id) {
    const branch = await db
      .selectFrom("chat_branches",)
      .select(["parent_message_id",],)
      .where("id", "=", chat.active_branch_id,)
      .where("chat_id", "=", chat.id,)
      .executeTakeFirst();
    if (branch) {
      const path: string[] = [];
      let current: string | null = branch.parent_message_id;
      for (let depth = 0; current !== null && depth < 1000; depth += 1) {
        const row = await db
          .selectFrom("messages",)
          .select(["id", "parent_id", "chat_id",],)
          .where("id", "=", current,)
          .executeTakeFirst();
        if (!row || row.chat_id !== chat.id) { break; }
        path.push(row.id,);
        current = row.parent_id;
      }
      return path.reverse();
    }
  }
  const rows = await db
    .selectFrom("messages",)
    .select(["id",],)
    .where("chat_id", "=", chat.id,)
    .where("visibility", "=", "visible",)
    .orderBy("created_at", "asc",)
    .execute();
  return rows.map((row,) => row.id,);
}

async function chatForkStubs(db: Kysely<DB>, chatId: string,): Promise<RenpyExportForkStub[]> {
  const branches: BranchRow[] = await db
    .selectFrom("chat_branches",)
    .select(["id", "parent_message_id", "name",],)
    .where("chat_id", "=", chatId,)
    .execute();
  // One stub per branch: the label below is the played path this run.
  // Renaming is the launcher author's job, not the exporter.
  return branches.map((branch, index,) => ({
    label: branch.name,
    target: `chat_${slugify(branch.name,)}_${index + 1}`,
  }),);
}

/**
 * Gather the export model for the given chats.
 * @param db - Kysely database handle
 * @param options - chat ids to include
 * @returns normalized model for the script builder
 */
export async function gatherExportModel(
  db: Kysely<DB>,
  options: GatherExportOptions,
): Promise<RenpyExportModel> {
  // Pass 1: raw per-message author ids in played-path order; collect the
  // distinct author set for one slug-assignment step below.
  const rawChats: { id: string; name: string; authors: string[]; texts: string[]; stubs: RenpyExportForkStub[] }[] = [];
  const meta = new Map<string, { displayName: string; avatarAssetId: string | null }>();

  for (const chatId of options.chatIds) {
    const chat = await loadChat(db, chatId,);
    const ids = await chatMessageIds(db, chat,);
    const rows = ids.length > 0 ? await db
      .selectFrom("messages",)
      .select(["id", "actor_id", "parent_id", "role", "content",],)
      .where("id", "in", ids,)
      .where("chat_id", "=", chatId,)
      .execute() as MessageRow[] : [];
    const byId = new Map(rows.map((row,) => [row.id, row,]),);
    const authors: string[] = [];
    const texts: string[] = [];
    for (const id of ids) {
      const row = byId.get(id,);
      if (!row) { continue; }
      await ensureMeta(db, chatId, row.actor_id, meta,);
      authors.push(row.actor_id,);
      texts.push(row.content,);
    }
    const stubs = await chatForkStubs(db, chatId,);
    rawChats.push({ id: chat.id, name: chat.name, authors, texts, stubs, },);
  }

  // Pass 2: one deduped slug per author, assigned once across all chats.
  const actorIds = [...meta.keys()];
  const deduped = uniqueSlugs(actorIds.map((actorId,) => meta.get(actorId)?.displayName ?? actorId,),);
  const slugs = new Map(actorIds.map((actorId, i,) => [actorId, deduped[i] ?? slugify(actorId,)] as const,),);

  const chats: RenpyExportChat[] = rawChats.map((raw,) => ({
    label: `chat_${slugify(raw.name,) || raw.id.slice(0, 8,)}`,
    name: raw.name,
    messages: raw.authors.map((actorId, i,) => ({ speaker: slugs.get(actorId,) ?? "", text: raw.texts[i] ?? "", }),),
    stubs: raw.stubs,
  }),);

  const characters: RenpyCharacter[] = [];
  const seen = new Set<string>();
  for (const [actorId, slug,] of slugs) {
    if (seen.has(slug,)) { continue; }
    seen.add(slug,);
    const actor = meta.get(actorId,);
    if (!actor) { continue; }
    characters.push({ slug, displayName: actor.displayName, assetId: actor.avatarAssetId, },);
  }

  // Pass 3: bundle bytes for public avatars only.
  const images = new Map<string, Uint8Array>();
  for (const character of characters) {
    if (!character.assetId) { continue; }
    const asset = await db
      .selectFrom("assets",)
      .select(["storage_path", "visibility",],)
      .where("id", "=", character.assetId,)
      .executeTakeFirst();
    if (asset?.visibility !== "public") { continue; }
    try {
      images.set(`game/images/${character.slug}.png`, await Bun.file(asset.storage_path,).bytes(),);
    } catch {
      // Missing avatar file: keep the define without bundling bytes.
    }
  }

  return { chats, characters, images, };
}

/** Cache one author's display name + avatar; non-participants stay absent. */
async function ensureMeta(
  db: Kysely<DB>,
  chatId: string,
  actorId: string,
  meta: Map<string, { displayName: string; avatarAssetId: string | null }>,
): Promise<void> {
  if (meta.has(actorId,)) { return; }
  const participant = await db
    .selectFrom("chat_participants",)
    .select(["actor_id",],)
    .where("chat_id", "=", chatId,)
    .where("actor_id", "=", actorId,)
    .executeTakeFirst();
  if (!participant) { return; }
  const actor = await db
    .selectFrom("actors",)
    .select(["display_name", "avatar_asset_id",],)
    .where("id", "=", actorId,)
    .executeTakeFirst();
  if (!actor) { return; }
  meta.set(actorId, { displayName: actor.display_name, avatarAssetId: actor.avatar_asset_id, },);
}
