// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { createMusicLinkService, } from "./music-links";
import type { MusicService, } from "../validation/schemas/music-links";

// Mock DB — typed as `any`; service is called with `as never` so only the
// methods we actually invoke need to exist on the object.
function makeMockDb(): any {
  return {
    insertInto: () => ({
      values: () => ({
        execute: async () => {},
      }),
    }),
    selectFrom: () => ({
      selectAll: () => ({
        where: () => ({
          executeTakeFirst: async () => null,
        }),
      }),
      delete: () => ({
        where: () => ({
          execute: async () => {},
        }),
      }),
    }),
  };
}

describe("MusicLinkService", () => {
  const db = makeMockDb();
  const service = createMusicLinkService(db as never, { nsfwFilterEnabled: false, },);

  describe("validateUrl", () => {
    test("spotify: accepts open.spotify.com/track/", () => {
      expect(service.validateUrl("https://open.spotify.com/track/abc123")).toBe("spotify" as MusicService);
    });

    test("spotify: accepts open.spotify.com/playlist/", () => {
      expect(service.validateUrl("https://open.spotify.com/playlist/abc123")).toBe("spotify" as MusicService);
    });

    test("youtube_music: accepts music.youtube.com/watch", () => {
      expect(service.validateUrl("https://music.youtube.com/watch?v=abc123")).toBe("youtube_music" as MusicService);
    });

    test("soundcloud: accepts soundcloud.com/", () => {
      expect(service.validateUrl("https://soundcloud.com/user/track")).toBe("soundcloud" as MusicService);
    });

    test("apple_music: accepts music.apple.com/", () => {
      expect(service.validateUrl("https://music.apple.com/us/album/name/123")).toBe("apple_music" as MusicService);
    });

    test("bandcamp: accepts subdomain.bandcamp.com/", () => {
      expect(service.validateUrl("https://artist.bandcamp.com/track/name")).toBe("bandcamp" as MusicService);
    });

    test("rejects plain http URLs", () => {
      expect(service.validateUrl("http://open.spotify.com/track/abc")).toBe("spotify" as MusicService);
    });

    test("rejects non-music URLs", () => {
      expect(service.validateUrl("https://example.com/song")).toBeNull();
    });

    test("rejects empty string", () => {
      expect(service.validateUrl("")).toBeNull();
    });
  });

  describe("store", () => {
    test("stores a link and returns row with correct fields", async () => {
      const row = await service.store({
        chatId: "chat-1",
        senderId: "user-1",
        sectionId: null,
        url: "https://open.spotify.com/track/abc",
        service: "spotify",
        metadata: {
          title: "Test Track",
          artist: "Test Artist",
          thumbnailUrl: null,
          durationSecs: null,
          serviceTrackId: "abc",
          serviceUrl: "https://open.spotify.com/track/abc",
          isPlaylist: false,
          trackCount: null,
          explicit: false,
          year: null,
          genre: null,
        },
        embedHtml: "<iframe src=\"https://open.spotify.com/embed/track/abc\"></iframe>",
      },);

      expect(row.id).toBeDefined();
      expect(row.chat_id).toBe("chat-1");
      expect(row.sender_id).toBe("user-1");
      expect(row.service).toBe("spotify");
      expect(row.title).toBe("Test Track");
      expect(row.artist).toBe("Test Artist");
    });

    test("explicit=true with nsfwFilterEnabled=false → nsfw_hidden=0", async () => {
      const svc = createMusicLinkService(db as never, { nsfwFilterEnabled: false },);
      const row = await svc.store({
        chatId: "chat-1",
        senderId: "user-1",
        sectionId: null,
        url: "https://open.spotify.com/track/abc",
        service: "spotify",
        metadata: {
          title: "Explicit Track",
          artist: "Artist",
          thumbnailUrl: null,
          durationSecs: null,
          serviceTrackId: "abc",
          serviceUrl: "https://open.spotify.com/track/abc",
          isPlaylist: false,
          trackCount: null,
          explicit: true,
          year: null,
          genre: null,
        },
        embedHtml: "<iframe></iframe>",
      },);

      expect(row.nsfw_hidden).toBe(0);
      expect(row.explicit).toBe(1);
    });
  });
});
