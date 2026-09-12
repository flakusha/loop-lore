// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Ownership transfer side effects (extracted from ./ownership.ts).
 *
 * Pure audit-meta builder + fire-and-forget transfer notifications.
 * Kept here to keep ownership.ts ≤250L.
 */
import type { Kysely, } from "kysely";
import { NotificationType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { NotificationService, } from "../../notifications/service";
import { safeJsonStringify, } from "../../utils/safe-json";

/** Fields identifying one completed ownership transfer. */
export interface OwnershipTransferEvent {
  chatId: string;
  previousOwnerId: string;
  newOwnerId: string;
  autoInvited: boolean;
  reason: string | null;
}

/**
 * Build the `log_entries.meta` JSON for a transfer.
 * Falls back to "{}" when stringification fails.
 */
export function buildOwnershipAuditMeta(event: OwnershipTransferEvent,): string {
  const result = safeJsonStringify({
    entity_type: "chat",
    entity_id: event.chatId,
    action: "transfer_ownership",
    previous_owner_id: event.previousOwnerId,
    new_owner_id: event.newOwnerId,
    auto_invited: event.autoInvited,
    reason: event.reason,
  },);
  return result.ok ? result.value : "{}";
}

/**
 * Emit the two transfer notifications (fire-and-forget: `emit` swallows
 * errors internally; do not wrap it here) + the success info log.
 */
export function emitOwnershipTransferNotifications(
  db: Kysely<DB>,
  event: OwnershipTransferEvent,
): void {
  const { chatId, previousOwnerId, newOwnerId, autoInvited, reason, } = event;
  const notifier = new NotificationService(db,);
  notifier.emit({
    userId: previousOwnerId,
    type: NotificationType.System,
    title: "Ownership transferred",
    body: "You are no longer the owner of this chat",
    link: `/chat/${chatId}`,
    data: { chatId, newOwnerId, autoInvited, reason, },
  },);
  notifier.emit({
    userId: newOwnerId,
    type: NotificationType.System,
    title: "You are now the chat owner",
    body: autoInvited
      ? "You have been added as the owner of this chat"
      : "You have been promoted to chat owner",
    link: `/chat/${chatId}`,
    data: { chatId, previousOwnerId, reason, },
  },);
  getLogger().child({ module: "chat-ownership", },).info("ownership transferred", {
    chatId,
    previousOwnerId,
    newOwnerId,
    autoInvited,
  },);
}
