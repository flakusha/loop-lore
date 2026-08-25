// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { linkAsset, } from "../../assets/service";
import type { Config, } from "../../config/schema";
import { encodeContent, } from "../../content/encode";
import {
  encryptAtRest,
  ensureActorKey,
  extractKeyIdFromPayload,
  getChatEncryptionLevel,
  getSmk,
  isEncryptedPayload,
  isEncryptionEnabled,
} from "../../crypto";
import type { DB, } from "../../db/schema";
import { extractMentionedActorIds, } from "../../group-chat/mention-parser";
import { notifyMention, } from "../../notifications/service";
import { safeJsonStringify, uid, } from "../../utils";
import { log, } from "./helpers";

/** Result of preparing a plaintext message body for durable storage. */
export interface StoredContent {
  storedContent: string;
  contentEncoding: string;
  storedKeyId: string | null;
}

/**
 * Prepare plaintext message content for storage.
 *
 * Handles three cases:
 *   1. Client pre-encrypted payload — stored as-is (key_id extracted).
 *   2. Server-side encryption enabled — routes through `encryptAtRest` which
 *      selects encryption by the chat's `encryption_level` tier.
 *   3. No encryption — gzip-compresses large plaintext, stores identity otherwise.
 */
export async function prepareContentStorage(
  database: Kysely<DB>,
  config: Config,
  chatId: string,
  actorId: string,
  plaintext: string,
): Promise<StoredContent> {
  if (isEncryptedPayload(plaintext,)) {
    const storedKeyId = extractKeyIdFromPayload(plaintext,);
    log().debug("Client pre-encrypted content detected", { keyId: storedKeyId, },);
    return { storedContent: plaintext, contentEncoding: "identity", storedKeyId, };
  }

  if (isEncryptionEnabled()) {
    const smk = getSmk() ?? undefined;
    if (smk) { await ensureActorKey({ database, actorId, smk, },); }
    const encryptionLevel = await getChatEncryptionLevel(database, chatId,);
    const result = await encryptAtRest({
      database,
      chatId,
      plaintext,
      encryptionLevel,
      config: {
        threshold: config.encryption.compressThreshold,
        algorithm: config.encryption.compressAlgorithm,
      },
    },);
    return { storedContent: result.storedContent, contentEncoding: "identity", storedKeyId: result.keyId, };
  }

  const LARGE_CONTENT_THRESHOLD = 10_240;
  if (plaintext.length > LARGE_CONTENT_THRESHOLD) {
    const encoded = encodeContent(plaintext, "gzip",);
    return { storedContent: encoded.encoded, contentEncoding: encoded.encoding, storedKeyId: null, };
  }
  return { storedContent: plaintext, contentEncoding: "identity", storedKeyId: null, };
}

/** Error thrown when an attachment references an asset the caller does not own. */
export class AttachmentOwnershipError extends Error {
  constructor(assetId: string,) {
    super(`Asset ${assetId} is not owned by the caller`,);
    this.name = "AttachmentOwnershipError";
  }
}

/** Link uploaded assets to the freshly-created message and persist the JSON. */
export async function attachMessageAttachments(
  database: Kysely<DB>,
  messageId: string,
  attachments: { assetId: string; order?: number; caption?: string; label?: string }[],
  ownerId: string,
): Promise<void> {
  const ids = attachments.map((a,) => a.assetId);
  if (ids.length > 0) {
    const rows = await database
      .selectFrom("assets",)
      .select(["id", "owner_id",],)
      .where("id", "in", ids,)
      .execute();
    const ownerById = new Map(rows.map((r,) => [r.id, r.owner_id,] as const),);
    for (const a of attachments) {
      if (ownerById.get(a.assetId,) !== ownerId) {
        throw new AttachmentOwnershipError(a.assetId,);
      }
    }
  }
  const attachData: { assetId: string; order: number; caption: string; label: string }[] = [];
  for (const [i, a,] of attachments.entries()) {
    await linkAsset({
      database,
      assetId: a.assetId,
      link: { entityType: "message", entityId: messageId, label: a.label ?? "message-attachment", },
    },);
    attachData.push({
      assetId: a.assetId,
      order: a.order ?? i,
      caption: a.caption ?? "",
      label: a.label ?? "message-attachment",
    },);
  }
  await database
    .updateTable("messages",)
    .set({
      attachments: (() => {
        const r = safeJsonStringify(attachData,);
        return r.ok ? r.value : "[]";
      })(),
    },)
    .where("id", "=", messageId,)
    .execute();
}

/** Persist an initiative claim for the actor in the chat's main scene. */
export async function persistInitiative(
  database: Kysely<DB>,
  chatId: string,
  actorId: string,
): Promise<void> {
  const currentScene = "main"; // TODO: detect actual current scene from story_state

  const existing = await database
    .selectFrom("group_initiatives",)
    .select("score",)
    .where("chat_id", "=", chatId,)
    .where("scene_id", "=", currentScene,)
    .where("actor_id", "=", actorId,)
    .executeTakeFirst();

  if (existing) {
    await database
      .updateTable("group_initiatives",)
      .set({ score: existing.score + 1, updated_at: new Date().toISOString(), },)
      .where("chat_id", "=", chatId,)
      .where("scene_id", "=", currentScene,)
      .where("actor_id", "=", actorId,)
      .execute();
  } else {
    await database
      .insertInto("group_initiatives",)
      .values({
        chat_id: chatId,
        scene_id: currentScene,
        actor_id: actorId,
        score: 1,
      },)
      .execute();
  }

  log().info("Initiative claimed", { chatId, actorId, scene: currentScene, },);
}

/** Per-actor persist + notify result counts returned to callers. */
export interface MentionPersistResult {
  /** Total mention rows successfully inserted into `chat_mentions`. */
  persisted: number;
  /** Total mention notifications successfully dispatched. */
  notified: number;
  /** Count of actors whose insert OR notification failed. */
  failed: number;
}

/** Record @mentions for the message and fire the mention notification. */
export async function persistMentions(
  database: Kysely<DB>,
  chatId: string,
  senderId: string,
  messageId: string,
  filteredContent: string,
): Promise<MentionPersistResult> {
  const result: MentionPersistResult = { persisted: 0, notified: 0, failed: 0, };
  const participants = await database
    .selectFrom("chat_participants",)
    .innerJoin("actors", "actors.id", "chat_participants.actor_id",)
    .select(["chat_participants.actor_id", "actors.display_name",],)
    .where("chat_participants.chat_id", "=", chatId,)
    .execute();
  const mentionedActorIds = extractMentionedActorIds(
    filteredContent,
    Array.from(participants, (p,) => ({ actorId: p.actor_id, displayName: p.display_name, }),),
  );
  if (mentionedActorIds.length === 0) { return result; }

  // Persist per-actor mention rows. Aggregate results so callers see counts.
  const insertOutcomes = await Promise.allSettled(
    mentionedActorIds.map(async (actorId,) => {
      try {
        await database
          .insertInto("chat_mentions",)
          .values({ id: uid(), message_id: messageId, actor_id: actorId, },)
          .execute();
        return actorId;
      } catch (err) {
        log().warn("persistMentions: insert failed", { chatId, actorId, err, },);
        throw err;
      }
    },),
  );

  // A duplicate-insert is benign (same actor mentioned twice in one message);
  // we treat any other failure as a real error.
  const persistedActorIds: string[] = [];
  for (const [i, outcome,] of insertOutcomes.entries()) {
    const actorId = mentionedActorIds[i]!;
    if (outcome.status === "fulfilled") {
      result.persisted++;
      persistedActorIds.push(actorId,);
    } else if (!isBenignMentionInsertError(outcome.reason,)) {
      result.failed++;
    } else {
      // Duplicate — count as persisted (the row already exists).
      result.persisted++;
      persistedActorIds.push(actorId,);
    }
  }

  // Fire notifications for actors whose mention row actually persisted.
  if (persistedActorIds.length === 0) { return result; }

  try {
    await notifyMention(database, {
      chatId,
      senderId,
      mentionedActorIds: persistedActorIds,
      messageId,
    },);
    result.notified = persistedActorIds.length;
  } catch (err) {
    log().warn("persistMentions: notifyMention failed", { chatId, senderId, err, },);
    result.failed += persistedActorIds.length;
  }
  return result;
}

/** True when the error is a unique-constraint violation (already-inserted row). */
function isBenignMentionInsertError(err: unknown,): boolean {
  if (err === null || typeof err !== "object") { return false; }
  const message = (err as { message?: unknown }).message;
  return typeof message === "string" && /unique|constraint/i.test(message,);
}
