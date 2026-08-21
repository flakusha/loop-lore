// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Music link route validation schemas.
 */
import { t, } from "elysia";
import {
  Id,
  OptionalId,
} from "./primitives";

// ── Service enum ─────────────────────────────────────────────

export const MusicServiceSchema = t.Union([
  t.Literal("spotify"),
  t.Literal("youtube_music"),
  t.Literal("soundcloud"),
  t.Literal("apple_music"),
  t.Literal("bandcamp"),
]);
export type MusicService = t.infer<typeof MusicServiceSchema>;

// ── Route schemas ────────────────────────────────────────────

export const MusicLinkCreateBody = t.Object({
  chatId: Id,
  url: t.String({ format: "uri", }),
  sectionId: OptionalId,
});

export const MusicLinkIdParams = t.Object({
  id: Id,
});

export const ChatIdParams = t.Object({
  chatId: Id,
});

export const MusicLinkResponse = t.Object({
  id: t.String(),
  chatId: t.String(),
  service: MusicServiceSchema,
  url: t.String(),
  embedHtml: t.Nullable(t.String()),
  title: t.String(),
  artist: t.String(),
  thumbnailUrl: t.Nullable(t.String()),
  durationSecs: t.Nullable(t.Number()),
  serviceTrackId: t.String(),
  serviceUrl: t.String(),
  isPlaylist: t.Boolean(),
  trackCount: t.Nullable(t.Number()),
  explicit: t.Boolean(),
  nsfwHidden: t.Boolean(),
  createdAt: t.String(),
});
