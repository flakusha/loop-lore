/**
 * Tests for the HTMX SSE generation-stream endpoint
 * (`handleGenerationStream`): replay on reconnect, live subscription,
 * done/error signalling, and keepalive headers.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import type { TestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { getOrCreateBuffer, removeBuffer, } from "../stream-buffer";
import { handleGenerationStream, } from "./stream";

const seenChatIds: string[] = [];
let db: Kysely<DB>;
let ownerId: string;
let sqlite: TestDb["sqlite"] | null = null;

beforeEach(async () => {
  const { db: freshDb, sqlite: raw, } = await createTestDb();
  db = freshDb;
  sqlite = raw;
  ownerId = `owner-${crypto.randomUUID()}`;
  await insertUsers(db, `${ownerId}-user`, "Owner", { id: ownerId, } as never,);
  await insertActors(db, "Owner", { id: ownerId, actor_type: "user", user_id: ownerId, } as never,);
},);

afterEach(() => {
  for (const id of seenChatIds) { removeBuffer(id,); }
  seenChatIds.length = 0;
  if (sqlite) { sqlite.close(); }
  sqlite = null;
},);

/** */
function chatId(): string {
  const id = `stream-test-${crypto.randomUUID()}`;
  seenChatIds.push(id,);
  return id;
}

/**
 * @param response
 */
async function readAll(response: Response,): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) { return ""; }
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value, } = await reader.read();
    if (done) { break; }
    out += decoder.decode(value, { stream: true, },);
  }
  out += decoder.decode();
  return out;
}

const sleep = (ms: number,) => new Promise((resolve,) => setTimeout(resolve, ms,));

describe("handleGenerationStream", () => {
  test("returns 401 when unauthenticated", async () => {
    const res = await handleGenerationStream(chatId(), new Headers(), db,);
    expect(res.status,).toBe(401,);
  });

  test("returns 403 for a non-participant of the chat", async () => {
    const chat = chatId();
    await insertChats(db, "Test", ownerId, { id: chat, } as never,);
    await insertChatParticipants(db, chat, ownerId, { role_in_chat: "owner", } as never,);
    const outsider = `outsider-${crypto.randomUUID()}`;
    await insertUsers(db, `${outsider}-user`, "Outsider", { id: outsider, } as never,);
    await insertActors(db, "Outsider", { id: outsider, actor_type: "user", user_id: outsider, } as never,);

    const res = await handleGenerationStream(chat, new Headers(), db, outsider,);
    expect(res.status,).toBe(403,);
  });

  test("returns 400 when chatId is missing", async () => {
    const res = await handleGenerationStream("", new Headers(), db, ownerId,);
    expect(res.status,).toBe(400,);
    expect(await res.json(),).toMatchObject({ error: "chatId is required", },);
  });

  test("sets SSE response headers for a participant", async () => {
    const chat = chatId();
    await insertChats(db, "Test", ownerId, { id: chat, } as never,);
    await insertChatParticipants(db, chat, ownerId, { role_in_chat: "owner", } as never,);

    const res = await handleGenerationStream(chat, new Headers(), db, ownerId,);
    expect(res.headers.get("Content-Type",),).toBe("text/event-stream",);
    expect(res.headers.get("Cache-Control",),).toBe("no-cache",);
    expect(res.headers.get("Connection",),).toBe("keep-alive",);
    expect(res.headers.get("X-Accel-Buffering",),).toBe("no",);
  });

  test("replays buffered events and closes when the buffer is done", async () => {
    const chat = chatId();
    await insertChats(db, "Test", ownerId, { id: chat, } as never,);
    await insertChatParticipants(db, chat, ownerId, { role_in_chat: "owner", } as never,);
    const buf = getOrCreateBuffer(chat,);
    buf.append("stream-update", "<p>one</p>",);
    buf.append("stream-update", "<p>two</p>",);
    buf.signalDone();

    const res = await handleGenerationStream(chat, new Headers(), db, ownerId,);
    const body = await readAll(res,);
    expect(body,).toContain("event: stream-update\n",);
    expect(body,).toContain("data: <p>one</p>",);
    expect(body,).toContain("data: <p>two</p>",);
  });

  test("replays only events after the Last-Event-ID sequence", async () => {
    const chat = chatId();
    await insertChats(db, "Test", ownerId, { id: chat, } as never,);
    await insertChatParticipants(db, chat, ownerId, { role_in_chat: "owner", } as never,);
    const buf = getOrCreateBuffer(chat,);
    buf.append("stream-update", "a",);
    buf.append("stream-update", "b",);
    buf.append("stream-update", "c",);
    buf.signalDone();

    const headers = new Headers({ "Last-Event-ID": "1", },);
    const body = await readAll(await handleGenerationStream(chat, headers, db, ownerId,),);
    expect(body,).not.toContain("data: a",);
    expect(body,).toContain("data: b",);
    expect(body,).toContain("data: c",);
  });

  test("prefixes every line of multi-line html with data:", async () => {
    const chat = chatId();
    await insertChats(db, "Test", ownerId, { id: chat, } as never,);
    await insertChatParticipants(db, chat, ownerId, { role_in_chat: "owner", } as never,);
    getOrCreateBuffer(chat,).append("stream-update", "line1\nline2",);
    getOrCreateBuffer(chat,).signalDone();

    const body = await readAll(await handleGenerationStream(chat, new Headers(), db, ownerId,),);
    expect(body,).toContain("data: line1\ndata: line2",);
  });

  test("emits stream-error and closes when no active generation exists", async () => {
    const chat = chatId();
    await insertChats(db, "Test", ownerId, { id: chat, } as never,);
    await insertChatParticipants(db, chat, ownerId, { role_in_chat: "owner", } as never,);
    const res = await handleGenerationStream(chat, new Headers(), db, ownerId,);
    const body = await readAll(res,);
    expect(body,).toContain("event: stream-error",);
    expect(body,).toContain("data: No active generation",);
  }, 20_000,);

  test("streams live events and a done event on completion", async () => {
    const chat = chatId();
    await insertChats(db, "Test", ownerId, { id: chat, } as never,);
    await insertChatParticipants(db, chat, ownerId, { role_in_chat: "owner", } as never,);
    const buf = getOrCreateBuffer(chat,);

    const chunks: string[] = [];
    const consume = (async () => {
      const reader = (await handleGenerationStream(chat, new Headers(), db, ownerId,)).body!.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value, } = await reader.read();
        if (done) { break; }
        chunks.push(decoder.decode(value, { stream: true, },),);
      }
      chunks.push(decoder.decode(),);
    })();

    // Let the stream subscribe to the buffer, then push a live event.
    await sleep(50,);
    buf.append("stream-update", "<p>live</p>",);
    buf.signalDone();

    await consume;
    const body = chunks.join("",);
    expect(body,).toContain("event: stream-update",);
    expect(body,).toContain("data: <p>live</p>",);
    expect(body,).toContain("event: stream-done\ndata: {}",);
  });

  test("streams a stream-error event when the buffer signals an error", async () => {
    const chat = chatId();
    await insertChats(db, "Test", ownerId, { id: chat, } as never,);
    await insertChatParticipants(db, chat, ownerId, { role_in_chat: "owner", } as never,);
    const buf = getOrCreateBuffer(chat,);

    const chunks: string[] = [];
    const consume = (async () => {
      const reader = (await handleGenerationStream(chat, new Headers(), db, ownerId,)).body!.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value, } = await reader.read();
        if (done) { break; }
        chunks.push(decoder.decode(value, { stream: true, },),);
      }
      chunks.push(decoder.decode(),);
    })();

    await sleep(50,);
    buf.signalError("provider blew up",);

    await consume;
    const body = chunks.join("",);
    expect(body,).toContain("event: stream-error",);
    expect(body,).toContain('data: {"error":"provider blew up"}',);
  });

  test("closes immediately when the buffer already errored before connect", async () => {
    const chat = chatId();
    await insertChats(db, "Test", ownerId, { id: chat, } as never,);
    await insertChatParticipants(db, chat, ownerId, { role_in_chat: "owner", } as never,);
    getOrCreateBuffer(chat,).signalError("pre-failed",);

    const body = await readAll(await handleGenerationStream(chat, new Headers(), db, ownerId,),);
    expect(body,).toBe("",);
  });
});
