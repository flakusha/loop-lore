// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * The chat-list row projection, repeated verbatim by both `chats` and the
 * `currentChat` getter in ChatCoreState — one shape, two places.
 */
export interface ChatRow {
  id: string;
  name?: string;
  type?: string;
  mode?: string;
  turn_strategy?: string;
  story_state?: string;
  gm_config?: string;
  thinking_visibility?: string;
}
