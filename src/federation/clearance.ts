// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/federation/clearance.ts — per-chat content-clearance gate for mesh pushes.
//
// Mesh membership alone MUST NOT imply clearance to replicate a chat's
// content (TASK-federation-content-clearance-gate-per-chat-consent-before-
// me). The gate is default-deny: `authorizeChatExport` refuses unless
//   1. the chat exists,
//   2. its encryption tier is `standard` — the only tier whose content is
//      replicated via the chat-DEK protocol (./dek-rewrap). `at-rest` DEKs
//      never leave the server, `none` chats have no DEK, and E2E-envelope
//      material (e2e_sessions chain/root keys, ephemeral_private_jwk) is not
//      part of this protocol at all, so the gate structurally cannot
//      authorize it; `user_api_keys` plaintext is likewise never touched by
//      the federation path.
//   3. `chats.federation_consented_at` is set (explicit per-chat opt-in;
//      revocation clears it back to NULL).
//
// The returned ChatClearance is branded with an unexported symbol, so the
// only way to obtain one is through this gate — exportChatDekForPeer
// requires it, making the export path physically unbypassable.

import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { canonicalOrigin, } from "./peer-fetch";

/** Runtime marker making ChatClearance unconstructable outside the gate. */
const clearanceBrand: unique symbol = Symbol("chat-clearance",);

/** A gate verdict authorizing one chat's export to one peer. Opaque by construction. */
export interface ChatClearance {
  readonly chatId: string;
  readonly peerOrigin: string;
  /** When the chat's federation consent was granted (DB value). */
  readonly consentedAt: string;
  readonly [clearanceBrand]: true;
}

/** Why the gate refused. */
export type ClearanceDenial =
  | "chat-missing"
  | "tier-not-exportable"
  | "no-consent"
  | "invalid-peer-origin";

/** Typed gate refusal. */
export class ChatClearanceError extends Error {
  /** Denial reason — match on this, never on the message. */
  readonly reason: ClearanceDenial;

  /** @param reason */
  constructor(reason: ClearanceDenial, chatId: string,) {
    super(`content clearance denied for ${chatId}: ${reason}`,);
    this.name = "ChatClearanceError";
    this.reason = reason;
  }
}

/**
 * Decide whether one chat's content may be replicated to one peer.
 * Default-deny: any missing piece (chat row, exportable tier, consent)
 * throws {@link ChatClearanceError}.
 * @param database Sender database handle.
 * @param input
 * @param input.chatId Replicated chat id.
 * @param input.peerOrigin Recipient peer origin (canonicalized internally).
 * @returns The opaque clearance to hand to the export/push path.
 * @throws {ChatClearanceError} On any denial.
 */
export async function authorizeChatExport(
  database: Kysely<DB>,
  input: {
    chatId: string;
    peerOrigin: string;
  },
): Promise<ChatClearance> {
  const peer = canonicalOrigin(input.peerOrigin,);
  if (peer === null) {
    throw new ChatClearanceError("invalid-peer-origin", input.chatId,);
  }

  const chat = await database
    .selectFrom("chats",)
    .select(["id", "encryption_level", "federation_consented_at",],)
    .where("id", "=", input.chatId,)
    .executeTakeFirst();

  if (chat === undefined) { throw new ChatClearanceError("chat-missing", input.chatId,); }
  if (chat.encryption_level !== "standard") {
    throw new ChatClearanceError("tier-not-exportable", input.chatId,);
  }

  if (chat.federation_consented_at === null) {
    throw new ChatClearanceError("no-consent", input.chatId,);
  }

  return {
    chatId: chat.id,
    peerOrigin: peer,
    consentedAt: chat.federation_consented_at,
    [clearanceBrand]: true,
  };
}

/**
 * Grant a chat's federation opt-in (idempotent; refreshes the timestamp).
 * @param database Database handle.
 * @param chatId
 */
export async function grantChatFederationConsent(
  database: Kysely<DB>,
  chatId: string,
): Promise<void> {
  await database
    .updateTable("chats",)
    .set({ federation_consented_at: new Date().toISOString(), },)
    .where("id", "=", chatId,)
    .execute();
}

/**
 * Revoke a chat's federation opt-in. The next gate check denies.
 * @param database Database handle.
 * @param chatId
 */
export async function revokeChatFederationConsent(
  database: Kysely<DB>,
  chatId: string,
): Promise<void> {
  await database
    .updateTable("chats",)
    .set({ federation_consented_at: null, },)
    .where("id", "=", chatId,)
    .execute();
}
