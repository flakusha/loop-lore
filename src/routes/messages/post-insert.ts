// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { titleUntitledChatFromFirstMessage, } from "../../chat/title-suggest";
import type { Config, FederationPeerTrustConfig, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createMeshEncryption, } from "../../federation/encryption";
import { fanOutContent, } from "../../federation/fan-out";
import { publicOriginOf, } from "../../federation/gossip";
import { type PeerPost, postPeerJson, } from "../../federation/peer-fetch";
import { getLogger, } from "../../logger";
import { handleSceneTransitions, } from "./handle-scene-transitions";
import { autoRenameChat, type ChatRecord, } from "./transitions";

/**
 * Post-insert chat side effects for a new user message: rule-based direct
 * rename, advisory AUX title for untitled non-direct chats (fire-and-forget,
 * never throws), scene-transition detection. Extracted from create.ts, which
 * sits at the size-gate limit.
 * @param {Kysely<DB>} database
 * @param {Config} config
 * @param {string} chatId
 * @param {string} actorId
 * @param {string} messageId
 * @param {string} effectiveContent
 * @param {ChatRecord | undefined} chatRecord
 * @returns {Promise<void>}
 */
export async function runPostInsertChatEffects(
  database: Kysely<DB>,
  config: Config,
  chatId: string,
  actorId: string,
  messageId: string,
  effectiveContent: string,
  chatRecord: ChatRecord | undefined,
): Promise<void> {
  await autoRenameChat(database, chatId, effectiveContent, chatRecord,);
  void titleUntitledChatFromFirstMessage({
    config,
    db: database,
    chatId,
    userId: actorId,
    chatRecord: chatRecord
      ? { name: chatRecord.name, mode: chatRecord.mode, }
      : undefined,
    firstMessage: effectiveContent,
  },);

  await handleSceneTransitions(database, config, chatId, actorId, effectiveContent, chatRecord, messageId,);

  replicateChatMessage(database, config, chatId, messageId, effectiveContent,);
}

/**
 * Federation sender trigger: replicate a persisted chat message to duplication
 * targets via fanOutContent. Fire-and-forget with a logged catch — a peer
 * failure must never fail or delay the message write (mirrors the advisory
 * title call above). No-op when federation is disabled. Chat id is always
 * populated: the content-clearance gate default-denies on a missing chat.
 * @param {Kysely<DB>} database
 * @param {Config} config
 * @param {string} chatId
 * @param {string} messageId
 * @param {string} effectiveContent
 * @returns {void}
 */
function replicateChatMessage(
  database: Kysely<DB>,
  config: Config,
  chatId: string,
  messageId: string,
  effectiveContent: string,
): void {
  if (!config.federation?.enabled) { return; }
  const trustByOrigin: Record<string, FederationPeerTrustConfig | undefined> = {};
  for (const peer of config.federation.peers) {
    trustByOrigin[peer.origin] = peer.trust;
  }

  const post: PeerPost = (url: string, body: unknown,) => postPeerJson(url, body, trustByOrigin[new URL(url,).origin],);
  void fanOutContent(
    database,
    post,
    publicOriginOf(config.server,),
    config.federation.duplication,
    createMeshEncryption(config.federation.meshPsk,),
    { id: messageId, content: effectiveContent, chatId, kind: "chat", },
    { meshPsk: config.federation.meshPsk, },
  ).catch((error: unknown,) => {
    getLogger().child({ module: "messages/post-insert", },).warn("chat fan-out failed", {
      chatId,
      messageId,
      error: error instanceof Error ? error.message : String(error,),
    },);
  },);
}
