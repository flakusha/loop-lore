// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Cross-chat parentId IDOR guard sentinel errors (BUG-cross-chat-parentId-IDOR).
 *
 * Thrown inside the message-create transaction body to drive the 404/403
 * branches in the route catch. Using class instances (not plain objects) so
 * the `instanceof` narrowing in the catch is type-safe.
 * @module routes/messages/parent-message-errors
 */

/** Thrown when parentId references a message that does not exist. */
export class ParentMessageNotFoundError extends Error {
  constructor() {
    super("parent message not found",);
    this.name = "ParentMessageNotFoundError";
  }
}

/** Thrown when parentId references a message that belongs to a different chat. */
export class ParentMessageNotInChatError extends Error {
  constructor() {
    super("parent message belongs to a different chat",);
    this.name = "ParentMessageNotInChatError";
  }
}