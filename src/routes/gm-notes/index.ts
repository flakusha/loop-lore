// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * GM Notes Routes
 *
 * CRUD endpoints for shadow notes and whitenotes.
 * These are GM narrative tools attached to chats.
 *
 * Shadow notes: hidden influences the GM tracks (foreshadowing, consequences, etc.)
 * Whitenotes: visible narrative directives (direction, tone, pacing, etc.)
 *
 * Barrel facade — registration point/name (`gm-notes`) preserved so the
 * `elysia-app.ts` wiring is unchanged.
 */
import { Elysia, } from "elysia";
import { shadowRoutes, } from "./shadow";
import type { HandlerOpts, } from "./types";
import { whitenoteRoutes, } from "./whitenotes";

export type { HandlerOpts, } from "./types";

/**
 * @param opts
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { chats: { ":id": { "shadow-notes": { ...; }; }; }; }; } & ... 5 more ... & { ...; }, { ...; }, { ...; } & { ...; }>}
 */
export function gmNotesRoutes(opts: HandlerOpts, prefix = "/api",) {
  return new Elysia({ name: "gm-notes", },)
    .use(shadowRoutes(opts, prefix,),)
    .use(whitenoteRoutes(opts, prefix,),);
}
