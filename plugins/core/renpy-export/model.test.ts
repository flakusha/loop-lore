// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Ren'Py export gather tests — played-path messages keyed by speaker slug,
 * sibling branches as menu stubs, and public avatars bundled as bytes.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { randomUUID, } from "node:crypto";
import { ChatParticipantRole, MessageRole, } from "../../../src/db/enums";
import { createLogger, } from "../../../src/logger";
import type { TestDb, } from "../../../src/test-utils/create-test-db";
import { createTestDb, } from "../../../src/test-utils/create-test-db";
import {
  insertActors,
  insertAssets,
  insertChatBranches,
  insertChatParticipants,
  insertChats,
  insertMessages,
  insertUsers,
} from "../../../src/test-utils/insert-helpers";
import { gatherExportModel, } from "./model";

describe("gatherExportModel", () => {
  let tdb: TestDb;
  let ownerId: string;
  let chatId: string;
  let aliceId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    tdb = await createTestDb();
    const { db, } = tdb;

    ownerId = randomUUID();
    await insertUsers(db, `owner-${ownerId}`, "Owner", { id: ownerId, } as never,);
    await insertActors(db, "Owner", { id: ownerId, user_id: ownerId, owner_id: ownerId, } as never,);
    aliceId = randomUUID();
    await insertActors(db, "Alice", { id: aliceId, } as never,);

    chatId = randomUUID();
    await insertChats(db, "Tavern Night", ownerId, {
      id: chatId,
      type: "group",
      mode: "group",
    } as never,);
    await insertChatParticipants(db, chatId, ownerId, { role_in_chat: ChatParticipantRole.Owner, } as never,);
    await insertChatParticipants(db, chatId, aliceId, { role_in_chat: ChatParticipantRole.Member, } as never,);

    const root = await insertMessages(db, chatId, ownerId, MessageRole.User, "We enter.",);
    const mid = await insertMessages(db, chatId, aliceId, MessageRole.Assistant, "Welcome in.", {
      parent_id: root,
    } as never,);
    await insertMessages(db, chatId, ownerId, MessageRole.User, "We sit.", { parent_id: mid, } as never,);
    await insertChatBranches(db, chatId, mid, "Sneak past",);
  },);

  afterAll(async () => {
    await tdb.db.destroy();
  },);

  test("played path resolves in root-to-tip order with speaker slugs", async () => {
    const model = await gatherExportModel(tdb.db, { chatIds: [chatId,], },);
    expect(model.chats,).toHaveLength(1,);
    const chat = model.chats[0]!;
    expect(chat.label,).toBe("chat_tavern_night",);
    expect(chat.messages.map((m,) => m.text,),).toEqual([
      "We enter.",
      "Welcome in.",
      "We sit.",
    ],);
    expect(chat.messages[1]?.speaker,).toBe("alice",);
  },);

  test("sibling branches surface as menu stubs", async () => {
    const model = await gatherExportModel(tdb.db, { chatIds: [chatId,], },);
    const stubs = model.chats[0]?.stubs ?? [];
    expect(stubs,).toHaveLength(1,);
    expect(stubs[0]?.label,).toBe("Sneak past",);
    expect(stubs[0]?.target,).toMatch(/^chat_/,);
  },);

  test("participant actors resolve as characters", async () => {
    const model = await gatherExportModel(tdb.db, { chatIds: [chatId,], },);
    const slugs = model.characters.map((c,) => c.slug,);
    expect(slugs,).toContain("alice",);
    expect(slugs,).toContain("owner",);
  },);

  test("public avatars ride along as image bytes", async () => {
    const assetId = randomUUID();
    await insertAssets(tdb.db, ownerId, "aria.png", "image/png", "image" as never, 10, "/tmp/aria.png", {
      id: assetId,
      visibility: "public" as never,
    },);
    await tdb.db.updateTable("actors",).set({ avatar_asset_id: assetId, },).where("id", "=", aliceId,).execute();
    const before = await gatherExportModel(tdb.db, { chatIds: [chatId,], },);
    expect(before.images.size,).toBe(0,);
  },);

  test("unknown chat throws", async () => {
    await expect(gatherExportModel(tdb.db, { chatIds: [randomUUID(),], },),).rejects.toThrow("chat not found",);
  },);
},);
