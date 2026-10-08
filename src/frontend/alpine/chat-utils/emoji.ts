// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Allowlisted `:shortcode:` → emoji map shared by every renderMarkdown
// consumer (chat bubbles, group chat, blog comments). Unknown codes stay
// literal text; the lookup is hasOwn-guarded so names like `constructor`
// never resolve via the prototype chain.

/** Canonical shortcode names; keep in sync with QUICK_EMOJIS in src/routes/message-reactions.ts. */
export const EMOJI_SHORTCODES: Record<string, string> = {
  "+1": "👍",
  thumbsup: "👍",
  heart: "❤️",
  joy: "😂",
  performing_arts: "🎭",
  theater: "🎭",
  crossed_swords: "⚔️",
  dagger: "🗡️",
  castle: "🏰",
  sparkles: "✨",
  skull: "💀",
  dragon: "🐉",
  evergreen_tree: "🌲",
  tree: "🌲",
  zap: "⚡",
  fire: "🔥",
  droplet: "💧",
  crescent_moon: "🌙",
  moon: "🌙",
};

/** Default quick-emoji picker order; mirrors QUICK_EMOJIS in src/routes/message-reactions.ts. */
export const DEFAULT_QUICK_EMOJIS: string[] = [
  "👍",
  "❤️",
  "😂",
  "🎭",
  "⚔️",
  "🗡️",
  "🏰",
  "✨",
  "💀",
  "🐉",
  "🌲",
  "⚡",
  "🔥",
  "💧",
  "🌙",
];

const SHORTCODE_PATTERN = /:([a-z0-9_+-]+):/g;
const CODE_SPAN_PATTERN = /(`[^`]*`)/g;

/**
 * Replace allowlisted `:shortcode:` occurrences with emoji.
 * Unknown codes stay literal; inline code spans are exempt.
 * Fenced code blocks are not exempt (ponytail: split on fences if that ever misfires).
 * @param content
 * @returns {string}
 */
export function renderShortcodes(content: string,): string {
  return content
    .split(CODE_SPAN_PATTERN,)
    .map((part, index,) =>
      index % 2 === 1
        ? part
        : part.replace(
          SHORTCODE_PATTERN,
          (match, name: string,) => (Object.hasOwn(EMOJI_SHORTCODES, name,) ? EMOJI_SHORTCODES[name]! : match),
        )
    )
    .join("",);
}
