// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/federation/dek-rewrap.ts — server-to-server chat DEK export protocol.
//
// Mesh content sharing replicates chat content whose messages are encrypted
// under the chat's stable per-chat DEK (chat_keys, SMK-wrapped at rest).
// Peers need that DEK, but `chat_keys.encrypted_chat_key` is an SMK wrap and
// MUST NOT be copied verbatim (TASK-federation-dek-re-wrap-protocol). Instead
// the sender re-wraps the raw DEK under the recipient peer's per-peering
// inbound content key — the same key that seals the push envelope (learned
// from the peer's /api/mesh-reserve response, see ./fan-out and
// ./peer-keys) — so the artifact is recipient-bound: only that peer can
// open it.
//
// Re-wrap is decrypt-then-rewrap (SMK unwrap, then AES-GCM under the peer
// key): the envelope format has no key-transport transform, so a
// wrap-to-wrap shortcut does not exist with current primitives. The raw DEK
// exists only in memory and is never persisted unwrapped, logged, or
// returned.
//
// Ordering constraint (TYPE-enforced): exportChatDekForPeer requires a
// ChatClearance, which can only be produced by authorizeChatExport in
// ./clearance — the per-chat content-clearance gate (issue 41f4f83). There
// is no way to call this function without passing the gate first.
//
// Rotation on peer removal: revoking/rotating the peer's inbound key (their
// side, via peer-keys) instantly kills every artifact wrapped under it;
// revokeDekExportsForPeer closes the sender-side audit trail. The chat's
// stable DEK itself does not rotate on peer removal (same design as local
// membership changes, src/crypto/chat-keys.ts).

import type { Kysely, } from "kysely";
import { decryptBytes, encryptBytes, } from "../crypto/actor-key-bytes";
import type { DB, } from "../db/schema";
import { safeFromUint8Array, } from "../utils/safe-buffer";
import { type ContentCipher, pskCipher, } from "./cipher";
import { type ChatClearance, } from "./clearance";
import { canonicalOrigin, } from "./peer-fetch";

/** A chat DEK re-wrapped for exactly one recipient peer. */
export interface RewrappedDek {
  /** Replicated chat id (stable across peers). */
  chatId: string;
  /** chat_keys.id the DEK was exported under — receiver imports this id so replicated messages' key_id resolves. */
  keyId: string;
  /** Exporting origin. */
  senderOrigin: string;
  /** AES-GCM ciphertext of the raw DEK under the peer's inbound content key (base64 envelope text). */
  wrappedKey: string;
  /** Export wall-clock ms. */
  wrappedAt: number;
}

/**
 * Re-wrap one chat's DEK for a peer and record the export in the audit log
 * (`mesh_dek_exports`; key material is never stored there). Requires a
 * {@link ChatClearance} from `authorizeChatExport` (./clearance) — chat and
 * peer identity come from the clearance, so the gate cannot be routed
 * around. Also requires the peer's inbound content key for this sender —
 * i.e. an existing reservation handshake — which binds the artifact to
 * that peer.
 * @param database Sender database handle.
 * @param smk Server master key wrapping chat_keys at rest.
 * @param input
 * @param input.clearance Gate verdict for this (chat, peer) pair.
 * @param input.senderOrigin This instance's origin.
 * @param input.peerContentKey Base64 inbound key issued by the peer.
 * @returns The artifact to push alongside the replicated content.
 * @throws {Error} When the sender origin is invalid, the chat has no DEK
 *   (e.g. an at-rest chat), or SMK unwrap fails.
 */
export async function exportChatDekForPeer(
  database: Kysely<DB>,
  smk: CryptoKey,
  input: {
    clearance: ChatClearance;
    senderOrigin: string;
    peerContentKey: string;
  },
): Promise<RewrappedDek> {
  const { clearance, } = input;
  const sender = canonicalOrigin(input.senderOrigin,);
  if (sender === null) { throw new Error(`invalid sender origin: ${input.senderOrigin}`,); }

  const row = await database
    .selectFrom("chat_keys",)
    .selectAll()
    .where("chat_id", "=", clearance.chatId,)
    .executeTakeFirst();

  if (row === undefined || row.encrypted_chat_key === "") {
    throw new Error(`chat key not found for ${clearance.chatId}`,);
  }

  const raw = await decryptBytes(smk, row.encrypted_chat_key,);
  const wrappedKey = await pskCipher(input.peerContentKey,).seal(raw as Uint8Array,);

  await database
    .insertInto("mesh_dek_exports",)
    .values({
      chat_id: clearance.chatId,
      key_id: row.id,
      peer_origin: clearance.peerOrigin,
      sender_origin: sender,
    },)
    .execute();

  return {
    chatId: clearance.chatId,
    keyId: row.id,
    senderOrigin: sender,
    wrappedKey,
    wrappedAt: Date.now(),
  };
}

/**
 * Close the sender-side audit trail for one peer (call on peer removal).
 * The cryptographic kill is the peer's inbound key rotation/revocation; the
 * chat's stable DEK intentionally does not rotate.
 * @param database Sender database handle.
 * @param peerOrigin Peer whose exports are revoked.
 * @returns Number of open export rows marked revoked.
 * @throws {Error} On an invalid peer origin.
 */
export async function revokeDekExportsForPeer(
  database: Kysely<DB>,
  peerOrigin: string,
): Promise<number> {
  const peer = canonicalOrigin(peerOrigin,);
  if (peer === null) { throw new Error(`invalid peer origin: ${peerOrigin}`,); }
  const result = await database
    .updateTable("mesh_dek_exports",)
    .set({ revoked_at: new Date().toISOString(), },)
    .where("peer_origin", "=", peer,)
    .where("revoked_at", "is", null,)
    .execute();

  return Number(result[0]?.numUpdatedRows ?? 0,);
}

/**
 * Open a re-wrapped DEK with the receiver's inbound ciphers (current, then
 * grace-previous — see ./peer-keys).
 * @param artifact Received artifact.
 * @param ciphers Ciphers to try in order.
 * @throws {Error} When no cipher opens the artifact.
 * @returns {Promise<Uint8Array>} The raw chat DEK (handle in memory only).
 */
export async function openRewrappedDek(
  artifact: RewrappedDek,
  ciphers: readonly ContentCipher[],
): Promise<Uint8Array> {
  let lastError: Error | null = null;
  for (const cipher of ciphers) {
    try {
      return await cipher.open(artifact.wrappedKey,);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error,),);
    }
  }

  throw new Error(
    `no inbound cipher opened the re-wrapped DEK for chat ${artifact.chatId}` +
      (lastError === null ? "" : `: ${lastError.message}`),
  );
}

/**
 * Receiver side: open a re-wrapped DEK and materialize it as this
 * instance's `chat_keys` row (SMK-wrapped at rest). The sender's key id is
 * reused so replicated messages' `key_id` resolves directly; an existing
 * row for the chat always wins (first import is authoritative). The
 * replicated chat row must exist first — `chat_keys.chat_id` is an FK to
 * `chats.id`.
 * @param database Receiver database handle.
 * @param smk Receiver server master key.
 * @param artifact Received artifact.
 * @param ciphers Inbound ciphers to try (current, then grace).
 * @returns The winning chat_keys id.
 * @throws {Error} When no cipher opens the artifact or the insert fails.
 */
export async function importChatDek(
  database: Kysely<DB>,
  smk: CryptoKey,
  artifact: RewrappedDek,
  ciphers: readonly ContentCipher[],
): Promise<string> {
  const raw = await openRewrappedDek(artifact, ciphers,);
  const rawBuf = safeFromUint8Array(raw,);
  if (!rawBuf.ok) { throw rawBuf.error; }
  const encrypted = await encryptBytes(smk, rawBuf.buffer,);

  await database
    .insertInto("chat_keys",)
    .values({
      id: artifact.keyId,
      chat_id: artifact.chatId,
      encrypted_chat_key: encrypted,
      created_at: new Date().toISOString(),
      expires_at: null,
    },)
    .onConflict((oc,) => oc.column("chat_id",).doNothing())
    .execute();

  const winner = await database
    .selectFrom("chat_keys",)
    .selectAll()
    .where("chat_id", "=", artifact.chatId,)
    .executeTakeFirstOrThrow();

  return winner.id;
}
