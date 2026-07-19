/**
 * E2E: Generation Flows
 *
 * Tests LLM generation endpoints via mock provider:
 *   POST /api/generation/generate (non-stream + stream + error paths)
 *   POST /api/generation/cancel
 *   GET  /api/generation/status/:chatId
 *   GET  /api/generation/active
 *   POST /api/generation/retry
 *   POST /api/generation/regenerate
 *
 * Uses MockLLMProvider registered at server startup.
 * Requires seeded user + chat + actor + message.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { type ApiClient, createClient, } from "../helpers/client";
import { SEED, seedAll, } from "../helpers/seed";
import { createTestServer, type TestServer, } from "../helpers/server";

describe("Generation E2E", () => {
  let server: TestServer;
  let api: ApiClient;

  beforeAll(async () => {
    server = await createTestServer({ auth: { required: true, }, }, true,);
    await seedAll(server.db,);
    api = createClient(server.url,);
    await api.loginAs(SEED.user.username, SEED.user.password,);
  },);

  afterAll(() => {
    if (server) { server.close(); }
  },);

  beforeEach(() => {
    // Always reset mock provider state — no flag leakage between tests
    if (!server?.mockProvider) {
      return;
    }

    server.mockProvider.failOnCall = false;
    server.mockProvider.streamError = false;
  },);
  // ── Generate (non-streaming) ─────────────────────────────

  test("POST /api/generation/generate returns generated content", async () => {
    const res = await api.post<{
      ok: boolean;
      content: string;
      messageId: string;
      attemptId: string;
      tokenUsage: { totalTokens: number };
    }>("/api/generation/generate", {
      chatId: SEED.chat.id,
      parentMessageId: SEED.message.id,
      actorId: SEED.character.id,
      idempotencyKey: "e2e-idemp-1",
      prompt: [{ role: "user", content: "Hello bot", },],
    },);

    expect(res.ok,).toBe(true,);
    expect(res.data,).toBeTruthy();
    expect(res.data!.ok,).toBe(true,);
    expect(res.data!.content,).toBe("Mock response content",);
    expect(res.data!.messageId,).toBeTruthy();
    expect(res.data!.attemptId,).toBeTruthy();
    expect(res.data!.tokenUsage.totalTokens,).toBe(30,);
  });

  test("POST /api/generation/generate stores message in DB", async () => {
    const res = await api.post<{ messageId: string; content: string }>(
      "/api/generation/generate",
      {
        chatId: SEED.chat.id,
        parentMessageId: SEED.message.id,
        actorId: SEED.character.id,
        idempotencyKey: "e2e-idemp-2",
        prompt: [{ role: "user", content: "DB store test", },],
      },
    );

    expect(res.ok,).toBe(true,);
    const msgId = res.data!.messageId;

    // Verify via GET /api/messages/:id
    const getRes = await api.get<{ content: string; role: string; provider: string }>(
      `/api/messages/${msgId}`,
    );
    expect(getRes.ok,).toBe(true,);
    expect(getRes.data!.role,).toBe("assistant",);
    expect(getRes.data!.content,).toBe("Mock response content",);
    expect(getRes.data!.provider,).toBe("mock-provider",);
  });

  test("POST /api/generation/generate validates required fields", async () => {
    const res = await api.post("/api/generation/generate", {
      chatId: SEED.chat.id,
      // Missing parentMessageId, actorId, idempotencyKey
    },);
    expect(res.status,).toBe(400,);
    expect(res.error,).toContain("parentMessageId",);
    expect(res.code,).toBeTruthy(); // TEST.2 error envelope
  });

  test("POST /api/generation/generate bad provider returns 422", async () => {
    const res = await api.post("/api/generation/generate", {
      chatId: SEED.chat.id,
      parentMessageId: SEED.message.id,
      actorId: SEED.character.id,
      idempotencyKey: "e2e-idemp-3",
      provider: "nonexistent-provider",
    },);
    expect(res.status,).toBe(422,);
    expect(res.error,).toContain("Provider resolution failed",);
    expect(res.code,).toBeTruthy(); // TEST.2 error envelope
  });

  test("POST /api/generation/generate uses prompt assembler when no explicit prompt", async () => {
    // When no `prompt` field provided, PromptAssembler builds from chat history
    const res = await api.post<{ ok: boolean; content: string }>(
      "/api/generation/generate",
      {
        chatId: SEED.chat.id,
        parentMessageId: SEED.message.id,
        actorId: SEED.character.id,
        idempotencyKey: "e2e-assemble-1",
        // No prompt field — triggers PromptAssembler path
      },
    );

    expect(res.ok,).toBe(true,);
    expect(res.data!.ok,).toBe(true,);
    expect(res.data!.content,).toBe("Mock response content",);
  });

  // ── Generate (streaming) ────────────────────────────────

  test("POST /api/generation/generate returns SSE stream", async () => {
    const res = await fetch(`${server.url}/api/generation/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `ll_token=${api.token}`,
      },
      body: JSON.stringify({
        chatId: SEED.chat.id,
        parentMessageId: SEED.message.id,
        actorId: SEED.character.id,
        idempotencyKey: "e2e-stream-1",
        prompt: [{ role: "user", content: "Stream test", },],
        stream: true,
      },),
    },);

    expect(res.status,).toBe(200,);
    expect(res.headers.get("Content-Type",),).toContain("text/event-stream",);

    const text = await res.text();
    expect(text,).toContain("Mock streamed",);
    expect(text,).toContain('"type":"done"',);
  });

  test("POST /api/generation/generate stream stores response", async () => {
    const idempotencyKey = `e2e-stream-store-${Date.now()}`;

    const res = await fetch(`${server.url}/api/generation/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `ll_token=${api.token}`,
      },
      body: JSON.stringify({
        chatId: SEED.chat.id,
        parentMessageId: SEED.message.id,
        actorId: SEED.character.id,
        idempotencyKey,
        prompt: [{ role: "user", content: "Store check", },],
        stream: true,
      },),
    },);

    const text = await res.text();

    // Extract message ID from done event
    const doneMatch = /"messageId":"([^"]+)"/.exec(text,);
    expect(doneMatch,).toBeTruthy();

    if (doneMatch) {
      const msgId = doneMatch[1];
      const getRes = await api.get<{ content: string }>(`/api/messages/${msgId}`,);
      expect(getRes.ok,).toBe(true,);
      expect(getRes.data!.content,).toBe("Mock streamed response",);
    }
  });

  test("POST /api/generation/generate stream returns SSE error on provider failure", async () => {
    server.mockProvider!.streamError = true;

    const res = await fetch(`${server.url}/api/generation/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `ll_token=${api.token}`,
      },
      body: JSON.stringify({
        chatId: SEED.chat.id,
        parentMessageId: SEED.message.id,
        actorId: SEED.character.id,
        idempotencyKey: "e2e-stream-err-1",
        prompt: [{ role: "user", content: "Fail stream", },],
        stream: true,
      },),
    },);

    // SSE error event should be emitted before connection closes
    const text = await res.text();
    expect(text,).toContain('"type":"error"',);
    expect(text,).toContain("Mock stream failure",);
  });

  // ── Cancel ──────────────────────────────────────────────

  test("POST /api/generation/cancel returns 404 when no active generation", async () => {
    const res = await api.post("/api/generation/cancel", {
      chatId: "00000000-0000-4000-a000-000000000099",
    },);
    expect(res.status,).toBe(404,);
    expect(res.code,).toBeTruthy(); // TEST.2 error envelope
  });

  test("POST /api/generation/cancel validates input", async () => {
    const res = await api.post("/api/generation/cancel", {},);
    expect(res.status,).toBe(400,);
    expect(res.error,).toContain("chatId",);
    expect(res.code,).toBeTruthy(); // TEST.2 error envelope
  });

  // ── Status ──────────────────────────────────────────────

  test("GET /api/generation/status/:chatId returns inactive for idle chat", async () => {
    const res = await api.get<{ isActive: boolean; attemptId: string | null }>(
      `/api/generation/status/${SEED.chat.id}`,
    );
    expect(res.ok,).toBe(true,);
    expect(res.data!.isActive,).toBe(false,);
    expect(res.data!.attemptId,).toBeNull();
  });

  // ── Active list ─────────────────────────────────────────

  test("GET /api/generation/active returns empty list when idle", async () => {
    const res = await api.get<{ count: number; generations: unknown[] }>(
      "/api/generation/active",
    );
    expect(res.ok,).toBe(true,);
    expect(res.data!.count,).toBe(0,);
    expect(res.data!.generations,).toEqual([],);
  });

  // ── Retry ───────────────────────────────────────────────

  test("POST /api/generation/retry returns 400 when chatId missing", async () => {
    const res = await api.post("/api/generation/retry", {},);
    expect(res.status,).toBe(400,);
    expect(res.code,).toBeTruthy(); // TEST.2 error envelope
  });

  test("POST /api/generation/retry returns ok with defaults", async () => {
    const res = await api.post<{
      ok: boolean;
      chatId: string;
      cancelled: boolean;
      resumeFromStep: number;
      totalSteps: number;
    }>("/api/generation/retry", { chatId: SEED.chat.id, },);

    expect(res.ok,).toBe(true,);
    expect(res.data!.ok,).toBe(true,);
    expect(res.data!.chatId,).toBe(SEED.chat.id,);
    expect(res.data!.cancelled,).toBe(false,);
    expect(res.data!.resumeFromStep,).toBe(0,);
    expect(res.data!.totalSteps,).toBe(1,);
  });

  // ── Regenerate ──────────────────────────────────────────

  test("POST /api/generation/regenerate returns 400 when chatId missing", async () => {
    const res = await api.post("/api/generation/regenerate", {},);
    expect(res.status,).toBe(400,);
    expect(res.code,).toBeTruthy(); // TEST.2 error envelope
  });

  test("POST /api/generation/regenerate returns ok", async () => {
    const res = await api.post<{ ok: boolean; chatId: string; ready: boolean }>(
      "/api/generation/regenerate",
      { chatId: SEED.chat.id, },
    );

    expect(res.ok,).toBe(true,);
    expect(res.data!.ok,).toBe(true,);
    expect(res.data!.chatId,).toBe(SEED.chat.id,);
    expect(res.data!.ready,).toBe(true,);
  });

  // ── Mock provider failure ────────────────────────────────

  test("generate returns 500 on mock provider failure", async () => {
    server.mockProvider!.failOnCall = true;

    const res = await api.post("/api/generation/generate", {
      chatId: SEED.chat.id,
      parentMessageId: SEED.message.id,
      actorId: SEED.character.id,
      idempotencyKey: "e2e-fail-1",
      prompt: [{ role: "user", content: "Fail", },],
    },);

    expect(res.status,).toBe(500,);
    expect(res.error,).toContain("Generation failed",);
  });

  // ── Boundary tests ──────────────────────────────────────

  test("generate handles very long prompt without crash", async () => {
    const longContent = "x".repeat(100_000,); // 100 KB

    const res = await api.post("/api/generation/generate", {
      chatId: SEED.chat.id,
      parentMessageId: SEED.message.id,
      actorId: SEED.character.id,
      idempotencyKey: "e2e-long-1",
      prompt: [
        { role: "system", content: "You are a helpful assistant.", },
        { role: "user", content: longContent, },
      ],
    },);

    // Mock provider ignores content size — succeeds gracefully
    if (res.ok) {
      expect((res.data as { content: string }).content,).toBe("Mock response content",);
    } else {
      expect(res.status,).toBeGreaterThanOrEqual(400,);
      expect(res.code,).toBeTruthy(); // TEST.2 error envelope
    }
  });

  test("generate with small prompt + maxTokens passes through", async () => {
    const res = await api.post<{ content: string; tokenUsage: { totalTokens: number } }>(
      "/api/generation/generate",
      {
        chatId: SEED.chat.id,
        parentMessageId: SEED.message.id,
        actorId: SEED.character.id,
        idempotencyKey: "e2e-small-1",
        prompt: [{ role: "user", content: "Hi", },],
        maxTokens: 10,
        temperature: 0.7,
        topP: 0.9,
      },
    );

    expect(res.ok,).toBe(true,);
    expect(res.data!.content,).toBe("Mock response content",);
    // maxTokens passed to provider — mock ignores but param flows through
    expect(res.data!.tokenUsage.totalTokens,).toBe(30,);
  });
});
