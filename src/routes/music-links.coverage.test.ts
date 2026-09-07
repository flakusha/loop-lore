// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage tests for music link routes (share / list / delete).
 *
 * Exercises auth gating, service-URL validation, Elysia body/param
 * validation, FK-violating section ids, and sender/admin delete paths.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { uid, } from "../utils";
import { musicLinksRoutes, } from "./music-links";

interface MusicLinkBody {
  id: string;
  chatId: string;
  service: string;
  url: string;
  embedHtml: string | null;
  title: string;
  artist: string;
  isPlaylist: boolean;
  explicit: boolean;
}

describe("musicLinksRoutes coverage", () => {
  let db: Kysely<DB>;
  const owner = uid();
  const stranger = uid();
  const chatId = uid();

  /**
   * Build the route app with the given auth context.
   * @param userId authenticated user or null for anonymous
   * @param userRole role string or null
   */
  function makeApp(userId: string | null, userRole: string | null,): Elysia {
    return new Elysia({ name: `test-music-links-${userId ?? "anon"}-${userRole ?? "none"}`, },)
      .derive({ as: "scoped", }, () => ({ userId, userRole, }),)
      .use(musicLinksRoutes({ database: db, },),) as unknown as Elysia;
  }

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    const stamp = Date.now().toString(36,);
    await db.insertInto("users",).values({
      id: owner,
      username: `ml-owner-${stamp}`,
      display_name: "ML Owner",
      password_hash: "h",
      role: "user",
      status: "active",
      settings: "{}",
    },).execute();
    await db.insertInto("users",).values({
      id: stranger,
      username: `ml-stranger-${stamp}`,
      display_name: "ML Stranger",
      password_hash: "h",
      role: "user",
      status: "active",
      settings: "{}",
    },).execute();
    await db.insertInto("chats",).values({ id: chatId, name: "ML Chat", created_by: owner, },).execute();
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("401 across share/list/delete without a userId", async () => {
    const app = makeApp(null, null,);
    const share = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/music-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ url: "https://open.spotify.com/track/abc", },),
      },),
    );
    expect(share.status,).toBe(401,);
    const list = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/music-links`,),
    );
    expect(list.status,).toBe(401,);
    const del = await app.handle(
      new Request(`http://localhost/api/music-links/${uid()}`, { method: "DELETE", },),
    );
    expect(del.status,).toBe(401,);
  });

  test("POST persists a link and returns the response shape", async () => {
    const app = makeApp(owner, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/music-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ url: "https://music.youtube.com/watch?v=abc123", },),
      },),
    );
    expect(res.status,).toBe(201,);
    const body = (await res.json()) as MusicLinkBody;
    expect(body.chatId,).toBe(chatId,);
    expect(body.service,).toBe("youtube_music",);
    expect(body.url,).toBe("https://music.youtube.com/watch?v=abc123",);
    expect(body.title,).toBe("Music",);
    expect(body.artist,).toBe("Unknown",);
    expect(body.embedHtml ?? "",).toContain("<iframe",);
    expect(body.isPlaylist,).toBe(false,);
    expect(body.explicit,).toBe(false,);
  });

  test("POST attempts oEmbed fetch for spotify URLs", async () => {
    // Spotify/SoundCloud hit the oEmbed endpoint (5s abort on failure),
    // so this case gets an extended timeout and asserts only the
    // network-independent fields.
    const app = makeApp(owner, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/music-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ url: "https://open.spotify.com/track/abc123", },),
      },),
    );
    expect(res.status,).toBe(201,);
    const body = (await res.json()) as MusicLinkBody;
    expect(body.service,).toBe("spotify",);
    expect(body.chatId,).toBe(chatId,);
    expect(typeof body.embedHtml,).toBe("string",);
  }, 20000,);

  test("POST accepts non-oEmbed services without network fetch", async () => {
    const app = makeApp(owner, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/music-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ url: "https://myband.bandcamp.com/track/song", },),
      },),
    );
    expect(res.status,).toBe(201,);
    const body = (await res.json()) as MusicLinkBody;
    expect(body.service,).toBe("bandcamp",);
    expect(body.title,).toBe("Music",);
    expect(body.artist,).toBe("Unknown",);
  });

  test("POST 400 for unsupported service URLs", async () => {
    const app = makeApp(owner, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/music-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ url: "https://example.com/song", },),
      },),
    );
    expect(res.status,).toBe(400,);
  });

  test("POST 422 for missing url, 400 for malformed JSON, 422 for wrong content-type", async () => {
    const app = makeApp(owner, "user",);
    const missing = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/music-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({},),
      },),
    );
    expect(missing.status,).toBe(422,);
    const malformed = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/music-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: "not-json{{{",
      },),
    );
    expect(malformed.status,).toBe(400,);
    const textBody = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/music-links`, {
        method: "POST",
        headers: { "Content-Type": "text/plain", },
        body: "x=1",
      },),
    );
    expect(textBody.status,).toBe(422,);
  });

  test("POST/GET 404 for unknown chats and chats without access", async () => {
    const app = makeApp(owner, "user",);
    const missing = await app.handle(
      new Request(`http://localhost/api/chats/${uid()}/music-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ url: "https://open.spotify.com/track/abc123", },),
      },),
    );
    expect(missing.status,).toBe(404,);
    const missingList = await app.handle(
      new Request(`http://localhost/api/chats/${uid()}/music-links`,),
    );
    expect(missingList.status,).toBe(404,);
    const outsider = makeApp(stranger, "user",);
    const denied = await outsider.handle(
      new Request(`http://localhost/api/chats/${chatId}/music-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ url: "https://open.spotify.com/track/abc123", },),
      },),
    );
    expect(denied.status,).toBe(404,);
  });

  test("POST 500 for FK-violating section ids", async () => {
    const app = makeApp(owner, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/music-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ url: "https://myband.bandcamp.com/track/fk", sectionId: uid(), },),
      },),
    );
    expect(res.status,).toBe(500,);
  });

  test("GET lists links shared in the chat", async () => {
    const app = makeApp(owner, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/music-links`,),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { data: MusicLinkBody[] };
    expect(body.data.length,).toBeGreaterThanOrEqual(2,);
    expect(body.data.every((row,) => row.chatId === chatId),).toBe(true,);
  });

  test("DELETE lets the sender remove a link and 404s afterwards", async () => {
    const app = makeApp(owner, "user",);
    const created = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/music-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ url: "https://music.youtube.com/watch?v=xyz", },),
      },),
    );
    expect(created.status,).toBe(201,);
    const row = (await created.json()) as MusicLinkBody;
    const del = await app.handle(
      new Request(`http://localhost/api/music-links/${row.id}`, { method: "DELETE", },),
    );
    expect(del.status,).toBe(204,);
    const again = await app.handle(
      new Request(`http://localhost/api/music-links/${row.id}`, { method: "DELETE", },),
    );
    expect(again.status,).toBe(404,);
  });

  test("DELETE 404s for unknown ids and callers without permission", async () => {
    const app = makeApp(owner, "user",);
    const unknown = await app.handle(
      new Request(`http://localhost/api/music-links/${uid()}`, { method: "DELETE", },),
    );
    expect(unknown.status,).toBe(404,);
    const created = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/music-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ url: "https://music.apple.com/us/song/xyz", },),
      },),
    );
    const row = (await created.json()) as MusicLinkBody;
    const outsider = makeApp(stranger, "user",);
    const denied = await outsider.handle(
      new Request(`http://localhost/api/music-links/${row.id}`, { method: "DELETE", },),
    );
    expect(denied.status,).toBe(404,);
    const admin = makeApp(stranger, "admin",);
    const byAdmin = await admin.handle(
      new Request(`http://localhost/api/music-links/${row.id}`, { method: "DELETE", },),
    );
    expect(byAdmin.status,).toBe(204,);
  });
});
