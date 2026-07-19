/**
 * E2E: Profanity Filter Flows
 *
 * Tests profanity filtering on message creation:
 *   1. Profanity words are replaced with asterisks
 *   2. Clean messages pass through unchanged
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type ApiClient, createClient, } from "../helpers/client";
import { SEED, seedAll, } from "../helpers/seed";
import { createTestServer, type TestServer, } from "../helpers/server";

describe("Profanity Filter E2E", () => {
  let server: TestServer;
  let api: ApiClient;

  beforeAll(async () => {
    server = await createTestServer();
    await seedAll(server.db,);
    api = createClient(server.url,);
    await api.loginAs(SEED.user.username, SEED.user.password,);
  },);

  afterAll(() => {
    server.close();
  },);
  test("filters profanity from user messages", async () => {
    // Send a message with profanity
    const msgRes = await api.post<{ id: string }>(
      `/api/chats/${SEED.chat.id}/messages`,
      {
        content: "this is fucking bullshit",
        role: "user",
      },
    );
    expect(msgRes.ok,).toBe(true,);
    expect(msgRes.data!.id,).toBeTruthy();

    // Get the message back and verify it's filtered
    const getRes = await api.get<{ content: string }>(
      `/api/messages/${msgRes.data!.id}`,
    );
    expect(getRes.ok,).toBe(true,);
    expect(getRes.data!.content,).not.toContain("fucking",);
    expect(getRes.data!.content,).not.toContain("bullshit",);
    // Should contain asterisks (replacement)
    expect(getRes.data!.content,).toMatch(/\*+/,);
  });

  test("allows clean messages through unchanged", async () => {
    const msgRes = await api.post<{ id: string }>(
      `/api/chats/${SEED.chat.id}/messages`,
      {
        content: "hello, how are you today?",
        role: "user",
      },
    );
    expect(msgRes.ok,).toBe(true,);

    const getRes = await api.get<{ content: string }>(
      `/api/messages/${msgRes.data!.id}`,
    );
    expect(getRes.data!.content,).toBe("hello, how are you today?",);
  });
});
