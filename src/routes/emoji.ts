// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Emoji shortcode registry route — the JSON twin of the client bundle.
 *
 * The htmx/Alpine client imports the registry from its bundle
 * (`src/frontend/alpine/chat-utils/emoji.ts`); this route exposes the SAME
 * registry as JSON so clients that own their own text layout (the egui wasm
 * frontend) render `:shortcode:` tokens against one source of truth. An
 * added shortcode lands in every client on the same deploy.
 *
 * The payload is a static allowlist — no per-user data, no DB — so the route
 * is public like the bundle it mirrors.
 */
import { Elysia, } from "elysia";
import { listEmojiShortcodes, } from "../frontend/alpine/chat-utils/emoji";
import { SuccessResponse, } from "../validation/schemas/primitives";

/**
 * @param opts
 * @param opts.prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { ...; }>}
 */
export function emojiRoutes(opts: { prefix?: string } = {},) {
  const prefix = opts.prefix ?? "/api";
  return new Elysia({ name: "emoji", },)
    .get(
      `${prefix}/emoji`,
      () => Response.json({ data: listEmojiShortcodes(), },),
      {
        response: {
          200: SuccessResponse,
        },
        detail: {
          summary: "List emoji shortcodes",
          description:
            "Returns the allowlisted :shortcode: → emoji registry in registry order, shared with the htmx client bundle.",
          tags: ["Assets",],
        },
      },
    );
}
