// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/notifications/service (barrel)
//
// Per-user notification service. Backs the in-app bell/dropdown, the
// notification preferences (stored in `users.settings.notifications`), and
// the LLM prompt-injection "Recent Events" feed.
//
// Triggers (mention, chat invite, quest update, GM action, system) call the
// exported `notify*` helpers, which fire-and-forget via `NotificationService.emit`
// so a notification failure never breaks the primary request.
//
// `NotificationService` remains a class (its constructor is used directly by
// callers/tests) with method bodies dispatched to sibling modules threaded with
// an explicit `db` handle.
export { NotificationType, } from "../../db/enums-core";
export { NotificationService, } from "./service";
export {
  notifyBlogComment,
  notifyBlogPost,
  notifyChatInvite,
  notifyGmAction,
  notifyMention,
  notifyQuestUpdate,
  notifySystem,
} from "./triggers";
export type {
  NotificationInput,
  NotificationPreferences,
  NotificationRecord,
} from "./types";
