// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Link preview route (TASK-link-previews-unfurl).
 *
 * GET /api/chats/:id/link-preview?url=... — cached OpenGraph unfurl for a
 * generic (non-music) URL. Access-gated via checkChatAccess in the service.
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import { unfurlLinkPreview, } from "../chat/service";
import type { DB, } from "../db/schema";
import { ErrorResponse, } from "../validation/schemas";
import { extractAuth, jsonResponse, requireUserId, } from "./http-utils";
import { serviceErrorToResponse, } from "./messages/helpers";

interface HandlerOpts {
  database: Kysely<DB>;
}

const tChatIdParams = t.Object({ id: t.String(), },);
const tPreviewQuery = t.Object({ url: t.String({ maxLength: 2048, },), },);

/**
 * @param opts
 * @param prefix
 */
export function linkPreviewRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return new Elysia({ name: "link-previews", },).get(
    `${prefix}/chats/:id/link-preview`,
    async (ctx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const { userRole, } = extractAuth(ctx,);
      const result = await unfurlLinkPreview({
        database,
        chatId: ctx.params.id,
        userId,
        userRole,
        url: ctx.query.url,
      },);

      if (!result.ok) { return serviceErrorToResponse(result.error,); }
      return jsonResponse(result.preview,);
    },
    {
      params: tChatIdParams,
      query: tPreviewQuery,
      response: { 200: t.Any(), 400: ErrorResponse, 401: ErrorResponse, 404: ErrorResponse, },
      detail: {
        summary: "Unfurl a generic link preview",
        description:
          "Cached OpenGraph preview for a non-music URL. SSRF-guarded (private networks refused), 3s timeout, 1MB cap, 7-day cache TTL.",
        tags: ["Chats", "Link previews",],
      },
    },
  );
}
