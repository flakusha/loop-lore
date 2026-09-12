// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { AssetLinkEntity, AssetType, } from "../../db/enums-content";
import { MessageRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertAssetLinks,
  insertAssets,
  insertChatParticipants,
  insertChats,
  insertMessages,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { forwardRoutes, } from "./forward";
type TestDb = Awaited<ReturnType<typeof createTestDb>>;
const BASE = "http://localhost";
const testConfig = {
  encryption: { compressThreshold: 1024, compressAlgorithm: "gzip", },
} as unknown as Config;
/**
 * Auth-context app via derive, mirroring message-search helpers.
 * @param db
 * @param userId
 * @param userRole
 */
function forwardApp(db: Kysely<DB>, userId: string | null, userRole: string | null,): Elysia {
  return new Elysia({ name: "test-message-forward", },)
    .derive(() => ({ userId, userRole, }),)
    .use(forwardRoutes({ database: db, config: testConfig, },),) as unknown as Elysia;
}
/**
 * @param app
 * @param req
 */
async function appHandle(app: Elysia, req: Request,): Promise<Response> {
  return (app as unknown as { handle: (r: Request,) => Promise<Response> }).handle(req,);
}
/**
 * @param path
 * @param body
 */
function post(path: string, body: unknown,): Request {
  return new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", },
    body: JSON.stringify(body,),
  },);
}
interface ForwardBody {
  id: string;
  droppedAttachments: number;
}
describe("forwardRoutes", () => {
  let db: Kysely<DB>;
  let sqlite: TestDb["sqlite"];
  let ownerId: string;
  let participantId: string;
  let outsiderId: string;
  let chatA: string;
  let chatB: string;
  let outsiderChat: string;
  let sourceMsg: string;
  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, sqlite, } = await createTestDb());
    ownerId = uid();
    participantId = uid();
    outsiderId = uid();
    await insertUsers(db, "owner", "Owner", { id: ownerId, } as never,);
    await insertUsers(db, "participant", "Participant", { id: participantId, } as never,);
    await insertUsers(db, "outsider", "Outsider", { id: outsiderId, } as never,);
    const actorOpts = (id: string,) => ({
      id,
      actor_type: "user",
      user_id: id,
      owner_id: id,
      agent_type: "none",
      settings: "{}",
      format_version: 0,
    } as never);
    await insertActors(db, "Owner", actorOpts(ownerId,),);
    await insertActors(db, "Participant", actorOpts(participantId,),);
    await insertActors(db, "Outsider", actorOpts(outsiderId,),);
    await insertChats(db, "Source Chat", ownerId, {},);
    chatA = (await db.selectFrom("chats",).select("id",).where("name", "=", "Source Chat",).executeTakeFirst())!.id;
    await insertChats(db, "Target Chat", participantId, {},);
    chatB = (await db.selectFrom("chats",).select("id",).where("name", "=", "Target Chat",).executeTakeFirst())!.id;
    await insertChats(db, "Outsider Chat", outsiderId, {},);
    outsiderChat = (await db.selectFrom("chats",).select("id",).where("name", "=", "Outsider Chat",).executeTakeFirst())!.id;
    await insertChatParticipants(db, chatA, participantId, {},);
    sourceMsg = uid();
    await insertMessages(db, chatA, ownerId, MessageRole.User, "the dragon hoard glitters", { id: sourceMsg, },);
  },);
  afterAll(async () => {
    await sqlite.close();
  },);
  test("returns 401 without userId", async () => {
    const app = forwardApp(db, null, null,);
    const res = await appHandle(app, post(`/api/chats/${chatA}/messages/${sourceMsg}/forward`, { targetChatId: chatB, },),);
    expect(res.status,).toBe(401,);
  },);
  test("returns 404 for an unknown message", async () => {
    const app = forwardApp(db, ownerId, "user",);
    const res = await appHandle(app, post(`/api/chats/${chatA}/messages/${uid()}/forward`, { targetChatId: chatB, },),);
    expect(res.status,).toBe(404,);
  },);
  test("returns 404 when the message belongs to another chat", async () => {
    const app = forwardApp(db, participantId, "user",);
    const res = await appHandle(app, post(`/api/chats/${chatB}/messages/${sourceMsg}/forward`, { targetChatId: chatB, },),);
    expect(res.status,).toBe(404,);
  },);
  test("denies a caller with no source access", async () => {
    const app = forwardApp(db, outsiderId, "user",);
    const res = await appHandle(app, post(`/api/chats/${chatA}/messages/${sourceMsg}/forward`, { targetChatId: outsiderChat, },),);
    expect([403, 404,],).toContain(res.status,);
  },);
  test("hides an inaccessible target chat", async () => {
    const app = forwardApp(db, participantId, "user",);
    const res = await appHandle(app, post(`/api/chats/${chatA}/messages/${sourceMsg}/forward`, { targetChatId: outsiderChat, },),);
    expect(res.status,).toBe(404,);
  },);
  test("copies content with attribution into the target chat", async () => {
    const app = forwardApp(db, participantId, "user",);
    const res = await appHandle(app, post(`/api/chats/${chatA}/messages/${sourceMsg}/forward`, { targetChatId: chatB, },),);
    expect(res.status,).toBe(201,);
    const body = (await res.json()) as ForwardBody;
    expect(body.droppedAttachments,).toBe(0,);
    const row = (await db.selectFrom("messages",).select(["chat_id", "actor_id", "content", "content_plaintext",],).where("id", "=", body.id,).executeTakeFirst())!;
    expect(row.chat_id,).toBe(chatB,);
    expect(row.actor_id,).toBe(participantId,);
    const text = row.content_plaintext ?? row.content;
    expect(text,).toContain("the dragon hoard glitters",);
    expect(text,).toContain("> Forwarded from Owner",);
  },);
  test("replays the same id on idempotency-key retry", async () => {
    const app = forwardApp(db, participantId, "user",);
    const payload = { targetChatId: chatB, idempotencyKey: `fwd-${uid()}`, };
    const first = await appHandle(app, post(`/api/chats/${chatA}/messages/${sourceMsg}/forward`, payload,),);
    const second = await appHandle(app, post(`/api/chats/${chatA}/messages/${sourceMsg}/forward`, payload,),);
    expect(first.status,).toBe(201,);
    expect(second.status,).toBe(201,);
    const a = (await first.json()) as ForwardBody;
    const b = (await second.json()) as ForwardBody;
    expect(a.id,).toBe(b.id,);
    const count = await db.selectFrom("messages",).select(({ fn, },) => fn.count<number>("id",).as("n",),).where("idempotency_key", "=", payload.idempotencyKey,).executeTakeFirst();
    expect(Number(count?.n ?? 0,),).toBe(1,);
  },);
  test("forwards only caller-owned attachments and counts drops", async () => {
    const ownedAsset = uid();
    const foreignAsset = uid();
    const msgWithFiles = uid();
    await insertMessages(db, chatA, participantId, MessageRole.User, "maps attached", { id: msgWithFiles, },);
    await insertAssets(db, participantId, "map.png", "image/png", AssetType.Image, 10, "/tmp/map.png", { id: ownedAsset, },);
    await insertAssets(db, outsiderId, "secret.png", "image/png", AssetType.Image, 10, "/tmp/secret.png", { id: foreignAsset, },);
    await insertAssetLinks(db, ownedAsset, AssetLinkEntity.Message, msgWithFiles, { label: "message-attachment", },);
    await insertAssetLinks(db, foreignAsset, AssetLinkEntity.Message, msgWithFiles, { label: "message-attachment", },);
    const app = forwardApp(db, participantId, "user",);
    const res = await appHandle(app, post(`/api/chats/${chatA}/messages/${msgWithFiles}/forward`, { targetChatId: chatB, },),);
    expect(res.status,).toBe(201,);
    const body = (await res.json()) as ForwardBody;
    expect(body.droppedAttachments,).toBe(1,);
    const links = await db.selectFrom("asset_links",).select("asset_id",).where("entity_type", "=", "message",).where("entity_id", "=", body.id,).execute();
    expect(links.map((l,) => l.asset_id,),).toEqual([ownedAsset,],);
  },);
},);
