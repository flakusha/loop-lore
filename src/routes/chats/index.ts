// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import { safeJsonParse, } from "../../utils";
import { batchRoutes, } from "./batch";
import { createRoutes, } from "./create";
import { extrasRoutes, } from "./extras";
import { listRoutes, } from "./list";
import { manageRoutes, } from "./manage";
import { participantRoutes, } from "./participants";
import { templatesRoutes, } from "./templates";
import type { HandlerOpts, } from "./types";

/**
 * Chat route module — barrel assembling the HTTP surface from domain
 * sub-plugins. Registration point/name (`chats`) is preserved so the
 * `elysia-app.ts` wiring is unchanged.
 */
export function chatsRoutes(opts: HandlerOpts, prefix = "/api",) {
  return (
    new Elysia({ name: "chats", },)
      // Capture raw request body text so handlers can distinguish fields the
      // client explicitly sent from Elysia's auto-applied enum defaults
      // (e.g. mode → "direct", turnStrategy → "round_robin").
      .onParse(async (ctx: any, contentType: string,) => {
        if (!contentType.includes("application/json",)) {
          return;
        }
        const text = await ctx.request.text();
        (ctx as { rawBodyText?: string }).rawBodyText = text;
        const parsed = safeJsonParse(text,);
        if (!parsed.ok) { throw parsed.error; }
        return parsed.value;
      },)
      .use(listRoutes(opts, prefix,),)
      .use(createRoutes(opts, prefix,),)
      .use(templatesRoutes(opts, prefix,),)
      .use(batchRoutes(opts, prefix,),)
      .use(manageRoutes(opts, prefix,),)
      .use(participantRoutes(opts, prefix,),)
      .use(extrasRoutes(opts, prefix,),)
  );
}
