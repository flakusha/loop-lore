// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat-axis enums that compose with `ChatMode` to determine runtime behavior.
 *
 * Per `db/state.ts` convention: enums with explicit transitions use
 * `createMachine`; pure 2/3-value sets with no automatic transitions stay as
 * `as const` objects (see `flags.ts:5-7` header "Boolean Flags (replacing
 * integer 0/1) → State Machines"). `ChatRenderingOverride` is in the latter
 * category: a 3-value rendering preference that composes with `ChatMode`'s
 * default rendering to produce the chat's effective presentation.
 *
 * Resolution rule (see `chat/types/config.ts::resolveRendering`):
 *   override === 'text'         → render as text
 *   override === 'visual_novel' → render as visual novel
 *   override === null           → fall back to MODE_DEFAULTS[chat.mode]
 *
 * `null` is intentionally the default state so new chats render per their
 * mode default without explicit opt-in.
 */

/** Per-mode rendering override stored inside `gm_config`. */
export const ChatRenderingOverride = {
  /** No override; render per `ChatMode` default. */
  Default: null,
  /** Force text rendering regardless of mode default. */
  Text: "text",
  /** Force visual-novel rendering regardless of mode default. */
  VisualNovel: "visual_novel",
} as const;

export type ChatRenderingOverride = typeof ChatRenderingOverride[keyof typeof ChatRenderingOverride];

/** String-union form for runtime validation (excludes the `null` marker). */
export type ChatRenderingOverrideValue = NonNullable<ChatRenderingOverride>;
