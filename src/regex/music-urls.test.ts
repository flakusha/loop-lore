import { describe, expect, test, } from "bun:test";
import { EXTERNAL_MUSIC_PATTERNS, } from "./music-urls";

function isExternalMusicUrl(url: string,): boolean {
  return EXTERNAL_MUSIC_PATTERNS.some((p,) => p.test(url,));
}

describe("EXTERNAL_MUSIC_PATTERNS", () => {
  describe("YouTube", () => {
    test.each([
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtube.com/watch?v=abc123",
      "https://www.youtube.com/watch?v=test",
    ],)("matches %s", (url,) => {
      expect(isExternalMusicUrl(url,),).toBe(true,);
    },);

    test("does not match youtube.com/channel", () => {
      expect(isExternalMusicUrl("https://www.youtube.com/channel/UC123",),).toBe(false,);
    });
  });

  describe("YouTube short", () => {
    test.each([
      "https://youtu.be/dQw4w9WgXcQ",
      "https://youtu.be/abc123",
    ],)("matches %s", (url,) => {
      expect(isExternalMusicUrl(url,),).toBe(true,);
    },);
  });

  describe("Spotify", () => {
    test.each([
      "https://spotify.com/track/abc123",
      "https://www.spotify.com/playlist/xyz",
      "https://spotify.com/track/test",
    ],)("matches %s", (url,) => {
      expect(isExternalMusicUrl(url,),).toBe(true,);
    },);

    test("does not match open.spotify.com (subdomain not in pattern)", () => {
      expect(isExternalMusicUrl("https://open.spotify.com/track/abc123",),).toBe(false,);
    });
  });

  describe("SoundCloud", () => {
    test.each([
      "https://soundcloud.com/artist/track",
      "https://www.soundcloud.com/user/sets/playlist",
      "https://soundcloud.com/test",
    ],)("matches %s", (url,) => {
      expect(isExternalMusicUrl(url,),).toBe(true,);
    },);
  });

  describe("Bandcamp", () => {
    test.each([
      "https://bandcamp.com/artist/album",
      "https://www.bandcamp.com/track/test",
      "https://bandcamp.com/artist/album",
    ],)("matches %s", (url,) => {
      expect(isExternalMusicUrl(url,),).toBe(true,);
    },);
  });

  describe("non-music URLs", () => {
    test.each([
      "https://example.com/music",
      "https://google.com/search?q=song",
      "not a url",
      "",
      "https://music.apple.com/us/album/test",
    ],)("does not match %s", (url,) => {
      expect(isExternalMusicUrl(url,),).toBe(false,);
    },);
  });
});
