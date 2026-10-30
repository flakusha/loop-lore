// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Owners-set side effects: audit-meta builder + notification fan-out
 * (epic-chat-multi-ownership). Mirrors ./ownership-events.ts.
 */
import type { Kysely, } from "kysely";
import { NotificationType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { NotificationService, } from "../../notifications/service";
import { safeJsonStringify, } from "../../utils";

/** Fields identifying one owners-set change. */
export interface OwnersChangeEvent {
  chatId: string;
  action: "chat_owner_added" | "chat_owner_removed";
  userId: string;
  performedBy: string;
  owners: string[];
  autoInvited: boolean;
  reason: string | null;
}

/**
 * Build the `log_entries.meta` JSON for an owners-set change.
 * @param {OwnersChangeEvent} event
 * @returns {string} JSON meta; "{}" on stringification failure
 */
export function buildOwnersAuditMeta(event: OwnersChangeEvent,): string {
  const result = safeJsonStringify({
    entity_type: "chat",
    entity_id: event.chatId,
    action: event.action,
    user_id: event.userId,
    performed_by: event.performedBy,
    owners: event.owners,
    auto_invited: event.autoInvited,
    reason: event.reason,
  },);

  return result.ok ? result.value : "{}";
}

/**
 * Fire-and-forget notifications: the affected user plus every remaining
 * owner (deduplicated — the affected user is a remaining owner on add).
 * `emit` swallows errors internally; do not wrap it here.
 * @param {Kysely<DB>} db
 * @param {OwnersChangeEvent} event
 * @returns {void}
 */
export function emitOwnersChangeNotifications(
  db: Kysely<DB>,
  event: OwnersChangeEvent,
): void {
  const added = event.action === "chat_owner_added";
  const recipients = Array.from(new Set(added ? [...event.owners,] : event.owners,),);
  const notifier = new NotificationService(db,);

  for (const userId of recipients) {
    const isAffected = userId === event.userId;
    notifier.emit({
      userId,
      type: NotificationType.System,
      title: isAffected
        ? added
          ? "You are now a chat owner"
          : "You are no longer a chat owner"
        : added
        ? "A co-owner was added to your chat"
        : "An owner left the chat owners set",
      body: isAffected
        ? added
          ? event.autoInvited
            ? "You have been added as an owner of this chat"
            : "You have been granted co-ownership of this chat"
          : "Your ownership of this chat was removed"
        : `Owner set changed by ${event.performedBy}`,
      link: `/chat/${event.chatId}`,
      data: { ...event, },
    },);
  }

  getLogger().child({ module: "chat-ownership", },).info(event.action, {
    chatId: event.chatId,
    userId: event.userId,
    owners: event.owners,
  },);
}
