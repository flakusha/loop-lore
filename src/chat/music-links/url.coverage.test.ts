// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Music-link URL helper coverage — per-service track-id extraction,
 * deep-link normalization, and embed-src rewriting, including
 * malformed and non-URL inputs.
 */
import { describe, expect, test, } from "bun:test";
import { extractTrackId, toEmbedSrc, toServiceUrl, } from "./url.js";

describe("extractTrackId", () => {
  test("extracts Spotify track/album/playlist ids", () => {
    expect(extractTrackId("https://open.spotify.com/track/abcDEF123", "spotify",),).toBe("abcDEF123",);
    expect(extractTrackId("https://open.spotify.com/album/xyz789?si=foo", "spotify",),).toBe("xyz789",);
    expect(extractTrackId("https://open.spotify.com/playlist/PL123", "spotify",),).toBe("PL123",);
  });

  test("returns the raw input when Spotify has no id segment", () => {
    expect(extractTrackId("not a url", "spotify",),).toBe("not a url",);
    expect(extractTrackId("", "spotify",),).toBe("",);
  });

  test("extracts YouTube Music video ids", () => {
    expect(
      extractTrackId("https://music.youtube.com/watch?v=dQw4w9WgXcQ", "youtube_music",),
    ).toBe("dQw4w9WgXcQ",);
  });

  test("extracts Apple Music numeric ids from 3-segment URLs", () => {
    expect(
      extractTrackId("https://music.apple.com/us/song/123456789", "apple_music",),
    ).toBe("123456789",);
  });

  test("soundcloud and bandcamp pass the URL through untouched", () => {
    const sc = "https://soundcloud.com/artist/song-title";
    expect(extractTrackId(sc, "soundcloud",),).toBe(sc,);
    const bc = "https://artist.bandcamp.com/track/song";
    expect(extractTrackId(bc, "bandcamp",),).toBe(bc,);
  });

  test("4-segment Apple album URLs fall back to the raw input", () => {
    const url = "https://music.apple.com/us/album/nevermind/123456789?i=987654321";
    expect(extractTrackId(url, "apple_music",),).toBe(url,);
  });

  test("falls back to raw input for malformed Apple URLs", () => {
    expect(extractTrackId("music.apple.com/broken", "apple_music",),).toBe("music.apple.com/broken",);
  });
});

describe("toServiceUrl", () => {
  test("keeps absolute http(s) URLs as-is", () => {
    expect(toServiceUrl("https://example.com/x", "spotify",),).toBe("https://example.com/x",);
    expect(toServiceUrl("http://example.com/x", "spotify",),).toBe("http://example.com/x",);
  });

  test("adds https to bare domains", () => {
    expect(toServiceUrl("open.spotify.com/track/1", "spotify",),).toBe("https://open.spotify.com/track/1",);
  });

  test("empty string becomes the bare https scheme", () => {
    expect(toServiceUrl("", "spotify",),).toBe("https://",);
  });
});

describe("toEmbedSrc", () => {
  test("rewrites YouTube Music to the www embed host", () => {
    expect(
      toEmbedSrc("https://music.youtube.com/watch?v=dQw4w9WgXcQ", "youtube_music",),
    ).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ",);
  });

  test("rewrites Apple Music to the embed widget host", () => {
    expect(
      toEmbedSrc("https://music.apple.com/us/album/123456789", "apple_music",),
    ).toBe("https://embed.music.apple.com/us/album/123456789",);
  });
  test("leaves unparseable Apple URLs (and other services) alone", () => {
    expect(toEmbedSrc("https://music.apple.com/broken", "apple_music",),).toBe(
      "https://music.apple.com/broken",
    );
    const sc = "https://soundcloud.com/a/b";
    expect(toEmbedSrc(sc, "soundcloud",),).toBe(sc,);
    const sp = "https://open.spotify.com/track/1";
    expect(toEmbedSrc(sp, "spotify",),).toBe(sp,);
  });

  test("bare domains gain https before rewriting", () => {
    expect(toEmbedSrc("music.youtube.com/watch?v=abc", "youtube_music",),).toBe(
      "https://www.youtube.com/watch?v=abc",
    );
  });
});
