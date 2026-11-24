// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Ren'Py export — normalized model shared by the DB gather step and the
 * pure .rpy text builder.
 *
 * A chat exports as: the played path (root-to-tip walk of the chat's
 * active branch) rendered inline, plus one menu stub per sibling branch
 * sharing a fork point (`parent_message_id`). Characters come from
 * `chat_participants` joined to `actors`; avatar bytes ride alongside for
 * `game/images/`.
 */
export interface RenpyExportMessage {
  /** Speaker variable slug (empty for narration). */
  speaker: string;
  /** Raw message text (escaped at render time). */
  text: string;
}

export interface RenpyForkStub {
  /** Menu option label shown to the Ren'Py player. */
  label: string;
  /** Target stub label the menu option jumps to. */
  target: string;
}

export interface RenpyExportChat {
  /** Stable Ren'Py label for this chat (`chat_<slug>`). */
  label: string;
  /** Human chat name (comment header only). */
  name: string;
  /** Played path: root-to-tip messages of the active branch. */
  messages: RenpyExportMessage[];
  /** Fork stubs grouped at their shared fork point. */
  stubs: RenpyForkStub[];
}

export interface RenpyCharacter {
  /** Ren'Py variable slug (`define <slug> = Character(...)`). */
  slug: string;
  /** Display name shown in the dialogue box. */
  displayName: string;
  /** Avatar asset id for images (null when none). */
  assetId: string | null;
}

export interface RenpyExportModel {
  chats: RenpyExportChat[];
  characters: RenpyCharacter[];
  /** `game/images/<file>` path -> raw bytes (public avatars only). */
  images: Map<string, Uint8Array>;
}
