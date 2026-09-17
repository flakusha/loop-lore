// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * v1 chatsSurface barrel (split out: one Elysia chain per file keeps TS2589 away).
 */
import { Elysia, } from "elysia";
import type { RegisterPluginsOpts, } from "../../app/register-plugins";
import { chatBackgroundsRoutes, } from "../chat-backgrounds";
import { chatContextRoutes, } from "../chat-context";
import { chatExportRoutes, } from "../chat-export";
import { chatPinRoutes, } from "../chat-pins";
import { chatSearchRoutes, } from "../chat-search";
import { chatSectionsRoutes, } from "../chat-sections";
import { chatsRoutes, } from "../chats";
import { invitesRoutes, } from "../invites";
import { messageReactionsRoutes, } from "../message-reactions";
import { messageSearchRoutes, } from "../message-search";
import { messageSeenRoutes, } from "../message-seen";
import { messagesRoutes, } from "../messages";
import { musicLinksRoutes, } from "../music-links";
import { vnGenerateRoutes, } from "../vn-generate";
import { worldInvitesRoutes, } from "../world-invites";

export function chatsSurface(opts: RegisterPluginsOpts,) {
  const { database, config, } = opts;
  const handleOpts = { database, config, };
  const prefix = "/api/v1";
  return new Elysia({ name: "v1-chats", },)
    // ── Chats & messages ─────────────────────────────────────
    .use(chatsRoutes(handleOpts, prefix,),)
    .use(messagesRoutes(handleOpts, prefix,),)
    .use(messageReactionsRoutes(handleOpts, prefix,),)
    .use(messageSearchRoutes(handleOpts, prefix,),)
    .use(messageSeenRoutes({ database, }, prefix,),)
    .use(musicLinksRoutes(handleOpts, prefix,),)
    .use(chatSearchRoutes(handleOpts, prefix,),)
    .use(chatSectionsRoutes(handleOpts, prefix,),)
    .use(chatBackgroundsRoutes(handleOpts, prefix,),)
    .use(chatPinRoutes(handleOpts, prefix,),)
    .use(chatExportRoutes(handleOpts, prefix,),)
    .use(chatContextRoutes(handleOpts, prefix,),)
    .use(invitesRoutes(handleOpts, prefix,),)
    .use(worldInvitesRoutes(handleOpts, prefix,),)
    .use(vnGenerateRoutes({ database, config, }, prefix,),);
}
