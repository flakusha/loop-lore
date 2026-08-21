// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Music Link Service — URL validation, oEmbed fetching, and DB storage
 * for music link messages (Spotify, YouTube Music, SoundCloud, Apple Music,
 * Bandcamp).
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { uid, } from "../utils";
import type { MusicService, } from "../validation/schemas/music-links";

// ── Types ────────────────────────────────────────────────────

export interface MusicLinkConfig {
  nsfwFilterEnabled: boolean;
}

export interface MusicMetadata {
  title: string;
  artist: string;
  thumbnailUrl: string | null;
  durationSecs: number | null;
  serviceTrackId: string;
  serviceUrl: string;
  isPlaylist: boolean;
  trackCount: number | null;
  explicit: boolean;
  year: number | null;
  genre: string | null;
}

export interface StoreParams {
  chatId: string;
  senderId: string;
  sectionId?: string | null;
  url: string;
  service: MusicService;
  metadata: MusicMetadata;
  embedHtml: string | null;
}

export interface MusicLinkRow {
  id: string;
  chat_id: string;
  section_id: string | null;
  sender_id: string;
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
  year: number | null;
  genre: string | null;
  nsfw_hidden: number;
  created_at: string;
}

// ── Service definitions ─────────────────────────────────────

const SERVICES = {
  spotify: {
    pattern: /^(https?:\/\/)?(open\.)?spotify\.com\/.+/,
    oembed: "https://open.spotify.com/oembed",
  },
  youtube_music: {
    pattern: /^(https?:\/\/)?music\.youtube\.com\/.+/,
    oembed: null,
  },
  soundcloud: {
    pattern: /^(https?:\/\/)?(www\.)?soundcloud\.com\/.+/,
    oembed: "https://soundcloud.com/oembed",
  },
  apple_music: {
    pattern: /^(https?:\/\/)?(www\.)?music\.apple\.com\/.+/,
    oembed: null,
  },
  bandcamp: {
    pattern: /^(https?:\/\/)?[\w-]+\.bandcamp\.com\/.+/,
    oembed: null,
  },
} as const satisfies Record<MusicService, { pattern: RegExp; oembed: string | null }>;

// ── Factory ──────────────────────────────────────────────────

export function createMusicLinkService(db: Kysely<DB>, config: MusicLinkConfig,) {
  /**
   * Detect which music service (if any) a URL belongs to.
   */
  function validateUrl(url: string,): MusicService | null {
    for (const [service, { pattern, }] of Object.entries(SERVICES) as [MusicService, { pattern: RegExp; oembed: string | null }][]) {
      if (pattern.test(url,)) {
        return service;
      }
    }
    return null;
  }

  /**
   * Fetch oEmbed metadata from a supporting service (Spotify, SoundCloud).
   * Returns raw oEmbed JSON fields; caller extracts what it needs.
   */
  async function fetchOembed(url: string, oembedEndpoint: string,): Promise<Record<string, unknown> | null> {
    try {
      const fetchUrl = `${oembedEndpoint}?url=${encodeURIComponent(url)}&format=json`;
      const res = await fetch(fetchUrl, { signal: AbortSignal.timeout(5000), });
      if (!res.ok) { return null; }
      return await res.json() as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  /**
   * Fetch metadata for a URL — uses oEmbed where available, otherwise
   * constructs embed HTML directly from the URL.
   */
  async function fetchMetadata(url: string, service: MusicService,): Promise<MusicMetadata> {
    const { oembed, } = SERVICES[service];

    // Spotify / SoundCloud — use oEmbed
    if (oembed) {
      const data = await fetchOembed(url, oembed,);
      if (data) {
        return {
          title: String(data["title"] ?? "Unknown"),
          artist: String(data["author_name"] ?? "Unknown"),
          thumbnailUrl: data["thumbnail_url"] ? String(data["thumbnail_url"]) : null,
          durationSecs: null,
          serviceTrackId: extractTrackId(url, service),
          serviceUrl: toServiceUrl(url, service),
          isPlaylist: url.includes("/playlist/") || url.includes("/album/"),
          trackCount: null,
          explicit: false,
          year: null,
          genre: null,
        };
      }
    }

    // YouTube Music / Apple Music / Bandcamp — iframe embed from URL
    return {
      title: "Music",
      artist: "Unknown",
      thumbnailUrl: null,
      durationSecs: null,
      serviceTrackId: extractTrackId(url, service),
      serviceUrl: toServiceUrl(url, service),
      isPlaylist: false,
      trackCount: null,
      explicit: false,
      year: null,
      genre: null,
    };
  }

  /**
   * Get iframe embed HTML for a URL — uses oEmbed HTML where available,
   * otherwise constructs an iframe src from the URL.
   */
  async function getEmbedHtml(url: string, service: MusicService,): Promise<string> {
    const { oembed, } = SERVICES[service];

    if (oembed) {
      const data = await fetchOembed(url, oembed,);
      if (data && typeof data["html"] === "string") {
        return data["html"] as string;
      }
    }

    // Fallback: construct iframe directly
    const embedSrc = toEmbedSrc(url, service);
    return `<iframe src="${embedSrc}" width="400" height="80" allow="autoplay" ` +
      `frameborder="0" scrolling="no"></iframe>`;
  }

  /**
   * Persist a music link to the DB.
   */
  async function store(params: StoreParams,): Promise<MusicLinkRow> {
    const id = uid();
    const { nsfwFilterEnabled, } = config;

    const nsfwHidden = params.metadata.explicit && nsfwFilterEnabled ? 1 : 0;

    await db
      .insertInto("music_links",)
      .values({
        id,
        chat_id: params.chatId,
        section_id: params.sectionId ?? null,
        sender_id: params.senderId,
        service: params.service,
        url: params.url,
        embed_html: nsfwHidden ? null : params.embedHtml,
        title: params.metadata.title,
        artist: params.metadata.artist,
        thumbnail_url: params.metadata.thumbnailUrl,
        duration_secs: params.metadata.durationSecs,
        service_track_id: params.metadata.serviceTrackId,
        service_url: params.metadata.serviceUrl,
        is_playlist: params.metadata.isPlaylist ? 1 : 0,
        track_count: params.metadata.trackCount,
        explicit: params.metadata.explicit ? 1 : 0,
        year: params.metadata.year,
        genre: params.metadata.genre,
        nsfw_hidden: nsfwHidden,
        created_at: new Date().toISOString(),
      },)
      .execute();

    const row = await db
      .selectFrom("music_links",)
      .selectAll()
      .where("id", "=", id,)
      .executeTakeFirst();

    return row as MusicLinkRow;
  }

  /**
   * List all music links in a chat, chronological.
   */
  async function list(chatId: string,): Promise<MusicLinkRow[]> {
    const rows = await db
      .selectFrom("music_links",)
      .selectAll()
      .where("chat_id", "=", chatId,)
      .orderBy("created_at", "asc",)
      .execute();
    return rows as MusicLinkRow[];
  }

  /**
   * Delete a music link. Caller must verify ownership.
   */
  async function destroy(id: string, _userId: string,): Promise<void> {
    await db.deleteFrom("music_links",).where("id", "=", id,).execute();
  }

  return { validateUrl, fetchMetadata, getEmbedHtml, store, list, destroy };
}

export type MusicLinkService = ReturnType<typeof createMusicLinkService>;

// ── Internal helpers ────────────────────────────────────────

function extractTrackId(url: string, service: MusicService,): string {
  switch (service) {
    case "spotify": {
      const m = url.match(/spotify\.com\/(track|album|playlist)\/([A-Za-z0-9]+)/,);
      return m ? m[2] : url;
    }
    case "youtube_music": {
      const m = url.match(/music\.youtube\.com\/watch\?v=([A-Za-z0-9_-]+)/,);
      return m ? m[1] : url;
    }
    case "soundcloud": {
      return url;
    }
    case "apple_music": {
      const m = url.match(/music\.apple\.com\/[\w-]+\/[\w-]+\/(\d+)/,);
      return m ? m[1] : url;
    }
    case "bandcamp": {
      return url;
    }
  }
}

function toServiceUrl(url: string, service: MusicService,): string {
  // Normalize to a clean https:// URL for deep linking
  if (url.startsWith("http")) { return url; }
  return `https://${url}`;
}

function toEmbedSrc(url: string, service: MusicService,): string {
  const clean = url.startsWith("http") ? url : `https://${url}`;
  switch (service) {
    case "youtube_music":
      return clean.replace("music.youtube.com", "www.youtube.com");
    case "apple_music": {
      // Apple Music embeds use embed.com widget
      const m = clean.match(/music\.apple\.com\/([\w-]+)\/([\w-]+)\/(\d+)/,);
      if (m) {
        return `https://embed.music.apple.com/${m[1]}/${m[2]}/${m[3]}`;
      }
      return clean;
    }
    default:
      return clean;
  }
}
