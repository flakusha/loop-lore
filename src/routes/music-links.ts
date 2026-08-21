// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Music Links — Elysia route plugin.
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createMusicLinkService, } from "../chat/music-links";
import { MusicLinkCreateBody, MusicLinkIdParams, ChatIdParams, MusicLinkResponse, } from "../validation/schemas/music-links";
import { jsonResponse, jsonCreated, jsonNoContent, requireUserId, } from "./http-utils";

export interface MusicLinkHandlerOpts {
  database: Kysely<DB>;
  nsfwFilterEnabled?: boolean;
}

export function musicLinksRoutes(opts: MusicLinkHandlerOpts,) {
  const { database: db, nsfwFilterEnabled = false, } = opts;

  const service = createMusicLinkService(db as Kysely<DB>, {
    nsfwFilterEnabled,
  },);

  return (
    new Elysia({ name: "music-links", },)
      .post(
        "/api/chats/:chatId/music-links",
        async (ctx,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }

          const chatId = ctx.params.chatId as string;
          const body = ctx.body as { chatId: string; url: string; sectionId?: string | null };

          // Detect service
          const serviceName = service.validateUrl(body.url,);
          if (!serviceName) {
            return jsonResponse({ error: "Unsupported music service URL", }, 400,);
          }

          // Fetch metadata + embed
          const metadata = await service.fetchMetadata(body.url, serviceName,);
          const embedHtml = await service.getEmbedHtml(body.url, serviceName,);

          // Persist
          const row = await service.store({
            chatId,
            senderId: userId,
            sectionId: body.sectionId ?? null,
            url: body.url,
            service: serviceName,
            metadata,
            embedHtml,
          },);

          return jsonCreated(toResponse(row),);
        },
        {
          body: MusicLinkCreateBody,
          params: ChatIdParams,
          response: {
            201: MusicLinkResponse,
            400: t.Object({ error: t.String(), },),
            401: t.Void(),
          },
          detail: {
            summary: "Share a music link",
            description: "Validate a music URL, fetch oEmbed metadata, and store the link.",
            tags: ["Chats", "Music Links",],
          },
        },
      )
      .get(
        "/api/chats/:chatId/music-links",
        async (ctx,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }

          const chatId = ctx.params.chatId as string;
          const rows = await service.list(chatId,);

          return jsonResponse({ data: rows.map(toResponse), },);
        },
        {
          params: ChatIdParams,
          response: {
            200: t.Object({ data: t.Array(MusicLinkResponse), },),
            401: t.Void(),
          },
          detail: {
            summary: "List music links in a chat",
            tags: ["Chats", "Music Links",],
          },
        },
      )
      .delete(
        "/api/music-links/:id",
        async (ctx,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }

          const id = ctx.params.id as string;
          await service.destroy(id, userId,);

          return jsonNoContent();
        },
        {
          params: MusicLinkIdParams,
          response: {
            204: t.Void(),
            401: t.Void(),
          },
          detail: {
            summary: "Delete a music link",
            tags: ["Music Links",],
          },
        },
      )
  );
}

// ── Response mapper ──────────────────────────────────────────

function toResponse(row: {
  id: string;
  chat_id: string;
  service: string;
  url: string;
  embed_html: string | null;
  title: string;
  artist: string;
  thumbnail_url: string | null;
  duration_secs: number | null;
  service_track_id: string;
  service_url: string;
  is_playlist: number;
  track_count: number | null;
  explicit: number;
  nsfw_hidden: number;
  created_at: string;
}) {
  return {
    id: row.id,
    chatId: row.chat_id,
    service: row.service,
    url: row.url,
    embedHtml: row.embed_html,
    title: row.title,
    artist: row.artist,
    thumbnailUrl: row.thumbnail_url,
    durationSecs: row.duration_secs,
    serviceTrackId: row.service_track_id,
    serviceUrl: row.service_url,
    isPlaylist: row.is_playlist === 1,
    trackCount: row.track_count,
    explicit: row.explicit === 1,
    nsfwHidden: row.nsfw_hidden === 1,
    createdAt: row.created_at,
  };
}
