// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** URL parsing helpers for music link services. */
import type { MusicService, } from "../../validation/schemas/music-links";

// ── Internal helpers ────────────────────────────────────────

/**
 * @param url
 * @param _service
 * @returns string
 */
export function extractTrackId(url: string, _service: MusicService,): string {
  switch (_service) {
    case "spotify": {
      const m = /spotify\.com\/(track|album|playlist)\/([A-Za-z0-9]+)/.exec(url,);
      return (m?.[2] ?? url) as string;
    }

    case "youtube_music": {
      const m = /music\.youtube\.com\/watch\?v=([A-Za-z0-9_-]+)/.exec(url,);
      return (m?.[1] ?? url) as string;
    }

    case "soundcloud": {
      return url;
    }

    case "bandcamp": {
      return url;
    }

    case "apple_music": {
      const m = /music\.apple\.com\/[\w-]+\/[\w-]+\/(\d+)/.exec(url,);
      return (m?.[1] ?? url) as string;
    }
  }
}

/**
 * @param url
 * @param _service
 * @returns void
 */
export function toServiceUrl(url: string, _service: MusicService,): string {
  // Normalize to a clean https:// URL for deep linking
  if (url.startsWith("http",)) { return url; }
  return `https://${url}`;
}

/**
 * Build a safe iframe src for a service URL.
 *
 * The URL is rebuilt from a parsed absolute URL so quotes, angle brackets and
 * control characters are percent-encoded, then checked against the https
 * scheme and the service host pattern. A suspicious input returns an empty
 * string, rendering an inert iframe rather than injecting markup or allowing
 * a foreign host.
 * @param url
 * @param service
 * @returns string
 */
export function toEmbedSrc(url: string, service: MusicService,): string {
  const candidate = `https://${url.replace(/^https?:\/\//i, "",)}`;
  let src: string;
  try {
    src = new URL(candidate,).href;
  } catch {
    return "";
  }

  if (!src.startsWith("https://",) || !SERVICES[service].pattern.test(src,)) {
    return "";
  }

  switch (service) {
    case "youtube_music":
      src = src.replace("music.youtube.com", "www.youtube.com",);
      break;
    case "apple_music": {
      const m = src.match(/music\.apple\.com\/([\w-]+)\/([\w-]+)\/(\d+)/,);
      if (m) {
        src = `https://embed.music.apple.com/${m[1]}/${m[2]}/${m[3]}`;
      }

      break;
    }

    default:
      break;
  }

  return /^https:\/\/[^"<>`\u0000-\u001F]*$/.test(src,) ? src : "";
}

/** Service URL patterns + oEmbed endpoints (moved from ../music-links.ts). */
export const SERVICES = {
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
