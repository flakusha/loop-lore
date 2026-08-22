import { t, } from "elysia";
import { Id, OptionalId, } from "./primitives";
import type { Static, } from "@sinclair/typebox";
// ── Service enum ─────────────────────────────────────────────

export const MusicServiceSchema = t.Union([
  t.Literal("spotify"),
  t.Literal("youtube_music"),
  t.Literal("soundcloud"),
  t.Literal("apple_music"),
  t.Literal("bandcamp"),
]);
export type MusicService = Static<typeof MusicServiceSchema>;

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
  id: Id,
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
