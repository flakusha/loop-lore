// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Server-side `:shortcode:` fallback for htmx/no-JS partials.
 *
 * Single source of truth lives in the client renderer
 * (`src/frontend/alpine/chat-utils/emoji.ts` — pure, no DOM deps);
 * this module re-exports it so server-rendered HTML (chat export,
 * chat-list preview) substitutes the same allowlist. Unknown codes stay
 * literal; inline code spans are exempt — see the client module.
 */
export { EMOJI_SHORTCODES, renderShortcodes, } from "../frontend/alpine/chat-utils/emoji";
