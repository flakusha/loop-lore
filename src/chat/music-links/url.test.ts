import { describe, expect, it, } from "bun:test";
import { extractTrackId, toEmbedSrc, toServiceUrl, } from "./url";

describe("chat/music-links/url (0% -> real logic)", () => {
  it("extractTrackId extracts Spotify track ID", () => {
    expect(extractTrackId("https://open.spotify.com/track/abc123", "spotify",),).toBe("abc123",);
  });
  it("extractTrackId extracts YouTube Music watch ID", () => {
    expect(extractTrackId("https://music.youtube.com/watch?v=dQw4w9WgXcQ", "youtube_music",),).toBe("dQw4w9WgXcQ",);
  });
  it("toServiceUrl builds Spotify embed URL", () => {
    const url = toServiceUrl("https://open.spotify.com/track/abc", "spotify",);
    expect(url,).toContain("open.spotify.com",);
  });
});
