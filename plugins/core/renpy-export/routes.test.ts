// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Ren'Py export route tests — versioned path guard, auth gate, body
 * validation, and the happy path returning a zip with the overlay files.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import JSZip from "jszip";
import { randomUUID, } from "node:crypto";
import { ChatParticipantRole, MessageRole, } from "../../../src/db/enums";
import { createLogger, } from "../../../src/logger";
import type { TestDb, } from "../../../src/test-utils/create-test-db";
import { createTestDb, } from "../../../src/test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertMessages,
  insertUsers,
} from "../../../src/test-utils/insert-helpers";
import { EXPORT_PATH, makeExportHandler, } from "./routes";

const CALLER = { userId: "u1", userRole: "member", };
const post = (body: unknown) => new Request(`http://x${EXPORT_PATH}`, {
  method: "POST",
  body: JSON.stringify(body,),
},);

describe("POST /api/renpy/export@v1", () => {
  let tdb: TestDb;
  let chatId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    tdb = await createTestDb();
    const { db, } = tdb;
    const ownerId = randomUUID();
    await insertUsers(db, `owner-${ownerId}`, "Owner", { id: ownerId, } as never,);
    await insertActors(db, "Owner", { id: ownerId, user_id: ownerId, owner_id: ownerId, } as never,);
    chatId = randomUUID();
    await insertChats(db, "Tavern", ownerId, { id: chatId, type: "direct", mode: "direct", } as never,);
    await insertChatParticipants(db, chatId, ownerId, { role_in_chat: ChatParticipantRole.Owner, } as never,);
    await insertMessages(db, chatId, ownerId, MessageRole.User, "We enter.",);
  },);

  afterAll(async () => {
    await tdb.db.destroy();
  },);

  test("rejects anonymous callers", async () => {
    const res = await makeExportHandler(tdb.db,)(post({ chatIds: [chatId,], }),);
    expect(res?.status,).toBe(401,);
  },);

  test("rejects an empty chat list", async () => {
    const res = await makeExportHandler(tdb.db,)(post({ chatIds: [], }), CALLER,);
    expect(res?.status,).toBe(400,);
  },);

  test("rejects malformed JSON", async () => {
    const res = await makeExportHandler(tdb.db,)(
      new Request(`http://x${EXPORT_PATH}`, { method: "POST", body: "not-json", },),
      CALLER,
    );
    expect(res?.status,).toBe(400,);
  },);

  test("404s unknown chats", async () => {
    const res = await makeExportHandler(tdb.db,)(post({ chatIds: [randomUUID(),], }), CALLER,);
    expect(res?.status,).toBe(404,);
  },);

  test("returns a zip with the overlay files", async () => {
    const res = await makeExportHandler(tdb.db,)(post({ chatIds: [chatId,], }), CALLER,);
    expect(res?.status,).toBe(200,);
    expect(res?.headers.get("content-type"),).toBe("application/zip",);
    expect(res?.headers.get("content-disposition"),).toContain("renpy-export.zip",);
    const zip = await JSZip.loadAsync(await res!.arrayBuffer(),);
    expect(Object.keys(zip.files,).filter((f,) => !f.endsWith("/",),).sort(),).toEqual([
      "README.md",
      "game/characters.rpy",
      "game/script.rpy"
    ],);
    const script = await zip.file("game/script.rpy")?.async("string",);
    expect(script,).toContain("label start:",);
    expect(script,).toContain("We enter.",);
  },);

  test("ignores the wrong path and method", async () => {
    const handler = makeExportHandler(tdb.db,);
    expect(await handler(new Request("http://x/api/renpy/export", { method: "POST", body: "{}", }), CALLER,),).toBeNull();
    expect(await handler(new Request(`http://x${EXPORT_PATH}`, { method: "GET", }), CALLER,),).toBeNull();
  },);
},);
