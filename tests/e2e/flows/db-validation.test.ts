/**
 * E2E: DB Insertion Validation
 *
 * Validates that entities created through the API have correct data
 * in the database — no Date.now() timestamps, no backtick artifacts,
 * no incorrect formats, no double/triple escaped characters.
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type ApiClient, createClient, } from "../helpers/client";
import { SEED, seedUsers, } from "../helpers/seed";
import { createTestServer, type TestServer, } from "../helpers/server";

describe("DB Insertion Validation E2E", () => {
  let server: TestServer;
  let api: ApiClient;

  beforeAll(async () => {
    server = await createTestServer();
    api = createClient(server.url,);
    await seedUsers(server.db,);
    await api.loginAs(SEED.user.username, SEED.user.password,);
  },);

  afterAll(() => {
    server.close();
  },);

  // ── Timestamps ────────────────────────────────────────────────

  test("created_at uses ISO format, not Date.now()", async () => {
    const res = await api.post<{ id: string; created_at: string }>("/api/worlds", { name: "Timestamp Test", },);
    expect(res.ok,).toBe(true,);

    const row = await server.db
      .selectFrom("worlds",)
      .select(["created_at",],)
      .where("id", "=", res.data!.id,)
      .executeTakeFirst();

    expect(row?.created_at,).toBeTruthy();
    // ISO format: YYYY-MM-DDTHH:MM:SS or YYYY-MM-DD HH:MM:SS
    expect(row!.created_at,).toMatch(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/,);
    // Must NOT be a JS timestamp (Date.now() produces 13-digit numbers)
    expect(row!.created_at.length,).toBeLessThan(20,);
  });

  // ── Backticks / Ticks ─────────────────────────────────────────

  test("chat name has no backtick artifacts", async () => {
    const name = "Normal Chat Name";
    const res = await api.post<{ id: string }>("/api/chats", { name, type: "direct", mode: "direct", },);
    expect(res.ok,).toBe(true,);

    const row = await server.db
      .selectFrom("chats",)
      .select(["name",],)
      .where("id", "=", res.data!.id,)
      .executeTakeFirst();

    expect(row?.name,).toBe(name,);
    expect(row?.name,).not.toContain("`",);
  });

  test("actor display_name has no backtick artifacts", async () => {
    const name = "Test Character";
    const res = await api.post<{ id: string }>("/api/actors", {
      displayName: name,
      actorType: "character",
      agentType: "ai",
    },);
    expect(res.ok,).toBe(true,);

    const row = await server.db
      .selectFrom("actors",)
      .select(["display_name",],)
      .where("id", "=", res.data!.id,)
      .executeTakeFirst();

    expect(row?.display_name,).toBe(name,);
    expect(row?.display_name,).not.toContain("`",);
  });

  // ── Escaped Characters ────────────────────────────────────────

  test("world description stores literal strings, not escaped", async () => {
    const desc = 'A world with "quotes" and \\backslash';
    const res = await api.post<{ id: string }>("/api/worlds", { name: "Escape Test", description: desc, },);
    expect(res.ok,).toBe(true,);

    const row = await server.db
      .selectFrom("worlds",)
      .select(["description",],)
      .where("id", "=", res.data!.id,)
      .executeTakeFirst();

    expect(row?.description,).toBe(desc,);
    // Must NOT have escaped quotes
    expect(row?.description,).not.toContain('\\"',);
    // Must NOT have double-escaped backslashes
    expect(row?.description,).not.toContain("\\\\\\\\",);
  });

  test("message content stores literal strings", async () => {
    const content = "She said \"hello\" and he replied 'ok'";
    // First create a chat
    const chatRes = await api.post<{ id: string }>("/api/chats", {
      name: "Msg Test",
      type: "direct",
      mode: "direct",
    },);
    expect(chatRes.ok,).toBe(true,);

    const msgRes = await api.post<{ id: string }>(`/api/chats/${chatRes.data!.id}/messages`, {
      content,
      role: "user",
    },);
    expect(msgRes.ok,).toBe(true,);

    const row = await server.db
      .selectFrom("messages",)
      .select(["content",],)
      .where("id", "=", msgRes.data!.id,)
      .executeTakeFirst();

    expect(row?.content,).toBe(content,);
    expect(row?.content,).not.toContain('\\"',);
  });

  // ── Date Format Correctness ───────────────────────────────────

  test("timestamps are parseable ISO dates", async () => {
    const res = await api.post<{ id: string }>("/api/worlds", { name: "ISO Test", },);
    expect(res.ok,).toBe(true,);

    const row = await server.db
      .selectFrom("worlds",)
      .select(["created_at", "updated_at",],)
      .where("id", "=", res.data!.id,)
      .executeTakeFirst();

    // created_at must be a valid date
    const createdDate = new Date(row!.created_at,);
    expect(createdDate.getTime(),).not.toBeNaN();

    // updated_at must be a valid date
    const updatedDate = new Date(row!.updated_at,);
    expect(updatedDate.getTime(),).not.toBeNaN();

    // Must NOT contain milliseconds (Date.now() style)
    expect(row!.created_at,).not.toMatch(/\.\d{3}/,);
  });

  // ── Empty / Null Handling ─────────────────────────────────────

  test("nullable fields store null, not empty string", async () => {
    const res = await api.post<{ id: string }>("/api/actors", {
      displayName: "Null Test",
      actorType: "character",
      agentType: "ai",
    },);
    expect(res.ok,).toBe(true,);

    const row = await server.db
      .selectFrom("actors",)
      .select(["description", "system_prompt", "personality",],)
      .where("id", "=", res.data!.id,)
      .executeTakeFirst();

    // These should be null (not empty string, not "null", not "undefined")
    expect(row?.description,).toBeNull();
    expect(row?.system_prompt,).toBeNull();
    expect(row?.personality,).toBeNull();
  });

  // ── Unicode Handling ──────────────────────────────────────────

  test("world name preserves unicode characters", async () => {
    const name = "Кириллица & 日本語 🎲";
    const res = await api.post<{ id: string }>("/api/worlds", { name, },);
    expect(res.ok,).toBe(true,);

    const row = await server.db
      .selectFrom("worlds",)
      .select(["name",],)
      .where("id", "=", res.data!.id,)
      .executeTakeFirst();

    expect(row?.name,).toBe(name,);
  });
});
