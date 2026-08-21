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

/** Link uploaded assets to the freshly-created message and persist the JSON. */
export async function attachMessageAttachments(
  database: Kysely<DB>,
  messageId: string,
  attachments: { assetId: string; order?: number; caption?: string; label?: string }[],
): Promise<void> {
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

/** Record @mentions for the message and fire the mention notification. */
export async function persistMentions(
  database: Kysely<DB>,
  chatId: string,
  senderId: string,
  messageId: string,
  filteredContent: string,
): Promise<void> {
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
  if (mentionedActorIds.length > 0) {
    const insertPromises: Promise<void>[] = [];
    for (const actorId of mentionedActorIds) {
      insertPromises.push(
        (async (): Promise<void> => {
          try {
            await database
              .insertInto("chat_mentions",)
              .values({ id: uid(), message_id: messageId, actor_id: actorId, },)
              .execute();
          } catch {
            /* ignore duplicate */
          }
        })(),
      );
    }
    await Promise.allSettled(insertPromises,);
    void notifyMention(database, {
      chatId,
      senderId,
      mentionedActorIds,
      messageId,
    },)
      // Mention notification failure is non-fatal — swallow.
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      .catch(() => {},);
  }
}
