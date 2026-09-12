// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { MessageRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertMessages,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { aiActionRoutes, buildAiActionPrompt, } from "./ai-action";
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
function actionApp(db: Kysely<DB>, userId: string | null, userRole: string | null,): Elysia {
  return new Elysia({ name: "test-message-ai-action", },)
    .derive(() => ({ userId, userRole, }),)
    .use(aiActionRoutes({ database: db, config: testConfig, },),) as unknown as Elysia;
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
describe("aiActionRoutes", () => {
  let db: Kysely<DB>;
  let sqlite: TestDb["sqlite"];
  let ownerId: string;
  let outsiderId: string;
  let chatId: string;
  let sourceMsg: string;
  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, sqlite, } = await createTestDb());
    ownerId = uid();
    outsiderId = uid();
    await insertUsers(db, "owner", "Owner", { id: ownerId, } as never,);
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
    await insertActors(db, "Outsider", actorOpts(outsiderId,),);
    await insertChats(db, "Action Chat", ownerId, {},);
    chatId = (await db.selectFrom("chats",).select("id",).where("name", "=", "Action Chat",).executeTakeFirst())!.id;
    await insertChatParticipants(db, chatId, ownerId, {},);
    sourceMsg = uid();
    await insertMessages(db, chatId, ownerId, MessageRole.User, "we should fix the gate before Friday", { id: sourceMsg, },);
  },);
  afterAll(async () => {
    await sqlite.close();
  },);
  test("returns 401 without userId", async () => {
    const app = actionApp(db, null, null,);
    const res = await appHandle(app, post(`/api/chats/${chatId}/messages/${sourceMsg}/ai-action`, { action: "summarize", },),);
    expect(res.status,).toBe(401,);
  },);
  test("returns 404 for an unknown message", async () => {
    const app = actionApp(db, ownerId, "user",);
    const res = await appHandle(app, post(`/api/chats/${chatId}/messages/${uid()}/ai-action`, { action: "summarize", },),);
    expect(res.status,).toBe(404,);
  },);
  test("denies a caller with no chat access", async () => {
    const app = actionApp(db, outsiderId, "user",);
    const res = await appHandle(app, post(`/api/chats/${chatId}/messages/${sourceMsg}/ai-action`, { action: "summarize", },),);
    expect([403, 404,],).toContain(res.status,);
  },);
  test("rejects an unknown action", async () => {
    const app = actionApp(db, ownerId, "user",);
    const res = await appHandle(app, post(`/api/chats/${chatId}/messages/${sourceMsg}/ai-action`, { action: "translate", },),);
    expect(res.status,).toBe(422,);
  },);
  test("returns 503 when no auxiliary model is configured", async () => {
    const app = actionApp(db, ownerId, "user",);
    const res = await appHandle(app, post(`/api/chats/${chatId}/messages/${sourceMsg}/ai-action`, { action: "action-items", },),);
    expect(res.status,).toBe(503,);
    const body = (await res.json()) as { error: string };
    expect(body.error,).toBe("ai_unavailable",);
  },);
},);
describe("buildAiActionPrompt", () => {
  test("each action embeds its instruction and the source", async () => {
    expect(buildAiActionPrompt("summarize", "dragon hoard",),).toContain("dragon hoard",);
    expect(buildAiActionPrompt("summarize", "dragon hoard",),).toContain("key points",);
    expect(buildAiActionPrompt("action-items", "fix the gate",),).toContain("action items",);
    expect(buildAiActionPrompt("explain", "quantum gate",),).toContain("simple terms",);
  },);
  test("caps long sources", async () => {
    const prompt = buildAiActionPrompt("summarize", "x".repeat(5000,),);
    expect(prompt.length,).toBeLessThan(5000,);
    expect(prompt,).toContain("x".repeat(100,),);
  },);
},);
