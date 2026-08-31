// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/routes/chat-backgrounds/
//
// Chat backgrounds — location-scoped (or global) background assets, and the
// per-chat assignment that drives what the chat UI displays. When a chat's
// `current_location_id` changes, `autoSyncChatBackground` resolves the highest
// priority background whose `location_id` matches and updates the assignment.
//
// Barrel facade — registration point/name (`chat-backgrounds`) preserved so the
// `elysia-app.ts` wiring is unchanged. Public data helpers are re-exported for
// external consumers (`chats/extras.ts`, chat-backgrounds.test.ts).
import { Elysia, } from "elysia";
import { assignmentRoutes, } from "./assignment";
import { catalogRoutes, } from "./catalog";
import type { HandlerOpts, } from "./types";

export { autoSyncChatBackground, getChatBackground, setChatBackground, } from "./service";
export type { HandlerOpts, } from "./types";

/**
 * @param opts
 */
export function chatBackgroundsRoutes(opts: HandlerOpts,) {
  return new Elysia({ name: "chat-backgrounds", },)
    .use(catalogRoutes(opts,),)
    .use(assignmentRoutes(opts,),);
}
