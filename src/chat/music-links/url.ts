// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** URL parsing helpers for music link services. */
import type { MusicService, } from "../../validation/schemas/music-links";

// ── Internal helpers ────────────────────────────────────────

/**
 * @param url
 * @param _service
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
 */
export function toServiceUrl(url: string, _service: MusicService,): string {
  // Normalize to a clean https:// URL for deep linking
  if (url.startsWith("http",)) { return url; }
  return `https://${url}`;
}

/**
 * @param url
 * @param service
 */
export function toEmbedSrc(url: string, service: MusicService,): string {
  const clean = url.startsWith("http",) ? url : `https://${url}`;
  switch (service) {
    case "youtube_music":
      return clean.replace("music.youtube.com", "www.youtube.com",);
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
