// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat organization — folders + tags.
 *
 * Vertical slice for `TASK-chat-feature-chat-organization-folders-tags`.
 *
 * Bounded scope: no schema exists for `chat_folders`/`chat_tags` yet,
 * so this module keeps folders and tags in process-local Maps keyed
 * by user/chat. The interface mirrors the eventual DB-backed
 * implementation, so swapping the in-memory store for Kysely queries
 * later is a one-file change.
 *
 * Idempotency: tagging a chat that already has the tag, or creating
 * a folder with a name that already exists under the same user, is a
 * no-op (returns the existing id).
 */

import { uid, } from "../utils";

interface Folder {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
}

interface ChatTagEntry {
  chatId: string;
  tag: string;
}

/** userId → folderId → Folder */
const folderStore = new Map<string, Map<string, Folder>>();

/** chatId → Set<tag> */
const tagStore = new Map<string, Set<string>>();

/** Test helper: drop everything in the in-memory stores. */
export function resetOrganizationStores(): void {
  folderStore.clear();
  tagStore.clear();
}

/**
 * Create a folder under a user. Folder names are case-folded for
 * uniqueness so "Stories" and "stories" collide (matches chat-list UX
 * expectations).
 * @param userId
 * @param name
 * @returns The new folder, or the existing folder with the same name.
 */
export function createFolder(
  userId: string,
  name: string,
): { id: string; userId: string; name: string; createdAt: string } {
  const normalized = name.trim();
  if (!normalized) {
    throw new Error("Folder name cannot be empty",);
  }
  const byName = normalized.toLowerCase();
  let userFolders = folderStore.get(userId,);
  if (!userFolders) {
    userFolders = new Map();
    folderStore.set(userId, userFolders,);
  }
  for (const folder of userFolders.values()) {
    if (folder.name.toLowerCase() === byName) {
      return folder;
    }
  }
  const folder: Folder = {
    id: uid(),
    userId,
    name: normalized,
    createdAt: new Date().toISOString(),
  };
  userFolders.set(folder.id, folder,);
  return folder;
}

/**
 * List folders owned by a user. Mostly a test seam; the eventual
 * DB-backed version will paginate.
 * @param userId
 */
export function listFolders(
  userId: string,
): Array<{ id: string; userId: string; name: string; createdAt: string }> {
  const userFolders = folderStore.get(userId,);
  if (!userFolders) { return []; }
  return Array.from(userFolders.values(),);
}

/**
 * Add a tag to a chat. Idempotent.
 * @param chatId
 * @param tag
 */
export function tagChat(chatId: string, tag: string,): void {
  const normalized = tag.trim();
  if (!normalized) { return; }
  let tags = tagStore.get(chatId,);
  if (!tags) {
    tags = new Set();
    tagStore.set(chatId, tags,);
  }
  tags.add(normalized,);
}

/**
 * Remove a tag from a chat. Idempotent.
 * @param chatId
 * @param tag
 */
export function untagChat(chatId: string, tag: string,): void {
  const tags = tagStore.get(chatId,);
  if (!tags) { return; }
  tags.delete(tag.trim(),);
}

/**
 * List the tags currently applied to a chat.
 * @param chatId
 */
export function listChatTags(chatId: string,): string[] {
  const tags = tagStore.get(chatId,);
  return tags ? Array.from(tags,) : [];
}

/** @internal exported for tests that want to seed state directly. */
export const __test = {
  tagStore: (chatId: string,): ChatTagEntry[] | null => {
    const tags = tagStore.get(chatId,);
    if (!tags) { return null; }
    return Array.from(tags, (t,) => ({ chatId, tag: t, }),);
  },
};
