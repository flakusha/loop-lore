// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /link — attach an existing gallery asset to the current chat (or a message
 * in it) via asset_links, without re-uploading.
 *
 * Flow: validate ownership and target → return a `link-asset` action carrying
 * the resolved target. Nothing is persisted here; the frontend shows a
 * confirm dialog and POSTs `/api/assets/:id/links` (owner-gated) on approval.
 */

import type { Kysely, } from "kysely";
import { AssetLinkEntity, ChatParticipantRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { type CommandResult, registerCommand, } from "./registry";

/** Link target resolved for the frontend confirm action. */
export interface LinkPreview {
  assetId: string;
  filename: string;
  entityType: AssetLinkEntity;
  entityId: string;
}

export type ResolveLinkResult =
  | { ok: true; preview: LinkPreview }
  | { ok: false; error: string };

/**
 * Validate the asset and link target. Extracted for tests; the command
 * passes the live context, tests pass a test db.
 * @param db
 * @param userId - requesting user (must own the asset or chat)
 * @param chatId - chat the link preview targets
 * @param assetId
 * @param messageId - optional message to scope the link
 * @returns ok preview, or an error result
 */
export async function resolveLinkPreview(
  db: Kysely<DB>,
  userId: string,
  chatId: string,
  assetId: string,
  messageId?: string,
): Promise<ResolveLinkResult> {
  const asset = await db
    .selectFrom("assets",)
    .select(["id", "filename", "owner_id",],)
    .where("id", "=", assetId,)
    .executeTakeFirst();
  if (!asset) { return { ok: false, error: `**Link:** asset "${assetId}" not found.`, }; }
  if (asset.owner_id !== userId) { return { ok: false, error: "**Link:** you don't own that asset.", }; }
  if (messageId !== undefined) {
    const message = await db
      .selectFrom("messages",)
      .select(["id", "chat_id",],)
      .where("id", "=", messageId,)
      .executeTakeFirst();
    if (!message) { return { ok: false, error: `**Link:** message "${messageId}" not found.`, }; }
    if (message.chat_id !== chatId) {
      return { ok: false, error: "**Link:** that message is in a different chat.", };
    }
    return {
      ok: true,
      preview: { assetId, filename: asset.filename, entityType: AssetLinkEntity.Message, entityId: messageId, },
    };
  }
  return {
    ok: true,
    preview: { assetId, filename: asset.filename, entityType: AssetLinkEntity.Chat, entityId: chatId, },
  };
}

registerCommand("link", async (args, ctx,): Promise<CommandResult> => {
  const db = ctx.db;
  if (!db) {
    return { systemMessage: "**Link unavailable:** command context missing database.", handled: true, };
  }
  const userId = ctx.userId;
  if (!userId) {
    return { systemMessage: "**Link unavailable:** missing user context.", handled: true, };
  }
  const assetId = (args[0] ?? "").trim();
  if (!assetId) {
    return {
      systemMessage: "Usage: `/link <assetId> [messageId]` — attach a gallery asset to this chat (or a message in it).",
      handled: true,
    };
  }
  const messageId = (args[1] ?? "").trim() || undefined;
  const resolved = await resolveLinkPreview(db, userId, ctx.chatId, assetId, messageId,);
  if (!resolved.ok) { return { systemMessage: resolved.error, handled: true, }; }
  const target = resolved.preview.entityType === AssetLinkEntity.Message
    ? `message \`${resolved.preview.entityId}\``
    : "this chat";
  return {
    systemMessage:
      `**Link preview** — attach **${resolved.preview.filename}** to ${target}? Confirm in the dialog to attach (no re-upload).`,
    action: "link-asset",
    actionPayload: { ...resolved.preview, },
    handled: true,
  };
}, { requiredRole: ChatParticipantRole.Member, },);
