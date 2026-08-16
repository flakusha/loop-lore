// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/routes/chat-export.ts
//
// Chat export routes — export chat as Markdown, JSON, HTML, or plain text.
//
// GET /api/chats/:id/export?format=markdown|json|html|text
// Returns the chat content in the requested format.

import { Elysia, } from "elysia";
import { exportChatRoute, } from "./export-route";
import type { HandlerOpts, } from "./types";

export function chatExportRoutes(opts: HandlerOpts,) {
  return (
    new Elysia({ name: "chat-export", },)
      .use(exportChatRoute(opts,),)
  );
}
