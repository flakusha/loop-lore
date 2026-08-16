// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * VN Dynamic Generation Routes
 *
 * POST /api/chats/:chatId/vn/generate-story — generate story descriptions
 * POST /api/chats/:chatId/vn/generate-choices — generate branching choices
 *
 * Barrel facade — registration point preserved so the `elysia-app.ts` wiring
 * is unchanged.
 */
import { Elysia, } from "elysia";
import { choicesRoutes, } from "./choices";
import { storyRoutes, } from "./story";
import type { VnGenerateRouteOpts, } from "./types";

export type { VnGenerateRouteOpts, } from "./types";

export function vnGenerateRoutes(opts: VnGenerateRouteOpts,) {
  return new Elysia({ prefix: "/api/chats", },)
    .use(storyRoutes(opts,),)
    .use(choicesRoutes(opts,),);
}
