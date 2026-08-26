// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Music Links route access-check tests.
 *
 * Bug: BUG-music-links-routes-lack-chat-access-checks-cross-chat-read-w
 *
 * Verifies that the music-links service enforces ownership on destroy()
 * (admin role / chat owner / original sender can delete; everyone else
 * is rejected).
 */

import { describe, expect, test, } from "bun:test";
import { createMusicLinkService, } from "../chat/music-links";

/** Generic row type for the in-memory mock DB. */
type Row = Record<string, unknown>;

/** Strip an optional `table.` prefix from a column qualifier. */
function stripQualifier(col: string,): string {
  const dot = col.indexOf(".",);
  return dot >= 0 ? col.slice(dot + 1,) : col;
}

/**
 * Minimal mock DB. Implements only the queries the music-links service
 * actually issues: insertInto, selectFrom with where+innerJoin,
 * deleteFrom.
 */
function makeMockDb(initialChats: Row[], initialLinks: Row[],): Record<string, unknown> {
  const tables: Record<string, Row[]> = {
    chats: [...initialChats,],
    music_links: [...initialLinks,],
  };

  const findBy = (table: string, col: string, val: unknown,): Row | undefined => {
    const arr = tables[table];
    const key = stripQualifier(col,);
    return arr?.find((row,) => row[key] === val,);
  };

  const filterBy = (table: string, col: string, val: unknown,): Row[] => {
    const arr = tables[table] ?? [];
    const key = stripQualifier(col,);
    return arr.filter((row,) => row[key] === val,);
  };

  return {
    insertInto: (table: string,) => ({
      values: (row: Row,) => ({
        execute: async () => {
          const arr = tables[table];
          if (arr) { arr.push(row,); }
        },
      }),
    }),
    selectFrom: (table: string,) => ({
      selectAll: () => ({
        where: (col: string, _op: string, val: unknown,) => ({
          executeTakeFirst: async () => findBy(table, col, val,) ?? null,
          execute: async () => filterBy(table, col, val,),
          orderBy: (_col: string,) => ({
            execute: async () =>
              filterBy(table, col, val,)
                .slice()
                .sort((a, b,) => String(a["created_at"] ?? "",).localeCompare(String(b["created_at"] ?? "",),),),
          }),
        }),
      }),
      innerJoin: (_joinTable: string, _leftCol: string, _rightCol: string,) => ({
        select: (_cols: string[],) => ({
          where: (col: string, _op: string, val: unknown,) => ({
            executeTakeFirst: async () => {
              const row = findBy(table, col, val,);
              if (!row) { return null; }
              const chat = tables["chats"]?.find((c,) => c["id"] === row["chat_id"],);
              return { sender_id: row["sender_id"], created_by: chat?.["created_by"] ?? null, };
            },
          }),
        }),
      }),
    }),
    deleteFrom: (table: string,) => ({
      where: (col: string, _op: string, val: unknown,) => ({
        execute: async () => {
          const arr = tables[table];
          if (!arr) { return; }
          const key = stripQualifier(col,);
          const idx = arr.findIndex((row,) => row[key] === val,);
          if (idx >= 0) { arr.splice(idx, 1,); }
        },
      }),
    }),
  };
}

const baseMetadata = {
  title: "Track",
  artist: "Artist",
  thumbnailUrl: null,
  durationSecs: null,
  serviceTrackId: "track-1",
  serviceUrl: "https://open.spotify.com/track/track-1",
  isPlaylist: false,
  trackCount: null,
  explicit: false,
  year: null,
  genre: null,
};

const chatFixture: Row = { id: "chat-1", created_by: "user-owner" };

describe("music-links service — destroy() ownership", () => {
  test("original sender can delete their own link", async () => {
    const db = makeMockDb([chatFixture,], [],);
    const service = createMusicLinkService(db as never, { nsfwFilterEnabled: false, },);

    const row = await service.store({
      chatId: "chat-1",
      senderId: "user-sender",
      sectionId: null,
      url: "https://open.spotify.com/track/self",
      service: "spotify",
      metadata: baseMetadata,
      embedHtml: "<iframe></iframe>",
    },);

    const ok = await service.destroy(row.id, "user-sender", "user",);
    expect(ok,).toBe(true,);
  });

  test("chat owner can delete any link in their chat", async () => {
    const db = makeMockDb([chatFixture,], [],);
    const service = createMusicLinkService(db as never, { nsfwFilterEnabled: false, },);

    const row = await service.store({
      chatId: "chat-1",
      senderId: "user-sender",
      sectionId: null,
      url: "https://open.spotify.com/track/owner-del",
      service: "spotify",
      metadata: baseMetadata,
      embedHtml: "<iframe></iframe>",
    },);

    const ok = await service.destroy(row.id, "user-owner", "user",);
    expect(ok,).toBe(true,);
  });

  test("admin role bypasses owner check", async () => {
    const db = makeMockDb([chatFixture,], [],);
    const service = createMusicLinkService(db as never, { nsfwFilterEnabled: false, },);

    const row = await service.store({
      chatId: "chat-1",
      senderId: "user-sender",
      sectionId: null,
      url: "https://open.spotify.com/track/admin-del",
      service: "spotify",
      metadata: baseMetadata,
      embedHtml: "<iframe></iframe>",
    },);

    const ok = await service.destroy(row.id, "user-admin", "admin",);
    expect(ok,).toBe(true,);
  });

  test("stranger cannot delete another user's link", async () => {
    const db = makeMockDb([chatFixture,], [],);
    const service = createMusicLinkService(db as never, { nsfwFilterEnabled: false, },);

    const row = await service.store({
      chatId: "chat-1",
      senderId: "user-sender",
      sectionId: null,
      url: "https://open.spotify.com/track/stranger-blocked",
      service: "spotify",
      metadata: baseMetadata,
      embedHtml: "<iframe></iframe>",
    },);

    const ok = await service.destroy(row.id, "user-stranger", "user",);
    expect(ok,).toBe(false,);
  });

  test("missing link returns false", async () => {
    const db = makeMockDb([chatFixture,], [],);
    const service = createMusicLinkService(db as never, { nsfwFilterEnabled: false, },);

    const ok = await service.destroy("does-not-exist", "user-sender", "user",);
    expect(ok,).toBe(false,);
  });
});
