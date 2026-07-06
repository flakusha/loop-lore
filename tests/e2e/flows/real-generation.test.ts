/**
 * E2E: Real-Server Generation
 *
 * Spawns llama.cpp / sd-server as child processes, runs generation,
 * verifies output, then shuts down. All tests skip gracefully when
 * binaries or models are missing.
 *
 * Prerequisites:
 *   llama-server or llama-server-vk in PATH
 *   sd-server in PATH
 *   config.yaml with testing.llamaModel / testing.sdModel set
 *   Or set LL_REAL_E2E_SKIP=1 to skip entirely
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createTestServer, type TestServer } from "../helpers/server";
import { createClient, type ApiClient } from "../helpers/client";
import { seedAll, SEED } from "../helpers/seed";
import { ServerExternalManager, type ServerInstance } from "../helpers/server-external";

import type { Logger } from "../../../src/logger";
import { safeJsonStringify } from "../../../src/utils";

/** Format log message — stringify objects via safe wrapper */
function fmtMsg(msg: string | Record<string, unknown>): string {
  if (typeof msg === "string") return msg;
  const r = safeJsonStringify(msg);
  return r.ok ? r.value : String(msg);
}

/** Logger — falls back to console if app logger not yet initialized */
const log: Logger = {
  debug: () => {},
  info(msg: string | Record<string, unknown>) { console.warn(`[server-external-e2e] ${fmtMsg(msg)}`); },
  warn(msg: string | Record<string, unknown>) { console.warn(`[server-external-e2e] ${fmtMsg(msg)}`); },
  error(msg: string | Record<string, unknown>) { console.error(`[server-external-e2e] ${fmtMsg(msg)}`); },
  child: () => log,
  flush: async () => {},
};

const SKIP_REAL = process.env.LL_REAL_E2E_SKIP === "1";
const describeReal = SKIP_REAL ? describe.skip : describe;

describeReal("Real-Server Generation E2E", () => {
  let manager: ServerExternalManager;
  let llamaInstance: ServerInstance | null = null;
  let sdInstance: ServerInstance | null = null;
  let server: TestServer;
  let api: ApiClient;
  let llamaPort = 9011;
  let sdPort = 9010;

  beforeAll(async () => {
    manager = new ServerExternalManager(log);
    server = await createTestServer({ auth: { required: true } });
    await seedAll(server.db);
    api = createClient(server.url);
    await api.loginAs(SEED.user.username, SEED.user.password);
  });

  afterAll(async () => {
    if (server) server.close();
    if (manager) await manager.stopAll();
  });

  async function ensureServers() {
    if (llamaInstance && sdInstance) return;

    const testing = server.config.testing;
    const llamaModel = testing?.llamaModel ?? "";
    const sdModel = testing?.sdModel ?? "";
    llamaPort = testing?.llamaPort ?? 9011;
    sdPort = testing?.sdPort ?? 9010;

    if (llamaModel && !llamaInstance) {
      llamaInstance = await manager.startLlamaCpp({
        port: llamaPort, modelPath: llamaModel, ctxSize: 8192,
        extraArgs: ["--alias", "e2e-model"],
      });
      log.info(llamaInstance
        ? `llama.cpp ready :${llamaPort}`
        : "llama.cpp skipped");
    }

    if (sdModel && !sdInstance) {
      sdInstance = await manager.startSdCpp({
        port: sdPort, modelPath: sdModel,
        extraArgs: ["--rng", "cpu", "--sampler-rng", "cpu"],
      });
      log.info(sdInstance
        ? `sd-server ready :${sdPort}`
        : "sd-server skipped");
    }

    if (!llamaInstance && !sdInstance) {
      log.warn("no servers available");
    }
  }

  // ── LLM ──────────────────────────────────────────────────

  describe("llama.cpp", () => {
    test("real LLM completes generation", { timeout: 60_000 }, async () => {
      await ensureServers();
      if (!llamaInstance) return;

      const { registerProvider } = await import("@/generation/providers/registry");
      const { OpenAiCompatibleProvider } = await import("@/generation/providers/openai-compatible");
      registerProvider("real-llama", new OpenAiCompatibleProvider({
        name: "real-llama", label: "Real llama.cpp",
        baseUrl: `http://127.0.0.1:${llamaPort}/v1`,
        model: "e2e-model", timeout: 30_000, retries: 2,
        allowUserApiKey: false,
        models: { "e2e-model": { contextLimit: 8192, maxOutput: 1024 } },
      }));

      const res = await api.post<{ ok: boolean; content: string; messageId: string }>(
        "/api/generation/generate", {
          chatId: SEED.chat.id,
          parentMessageId: SEED.message.id,
          actorId: SEED.character.id,
          idempotencyKey: "real-llm-1",
          provider: "real-llama",
          prompt: [{ role: "system", content: "Reply with exactly: OK" }, { role: "user", content: "Say OK" }],
          maxTokens: 50, temperature: 0,
        });

      expect(res.status).toBe(200);
      if (res.data) {
        expect(res.data.ok).toBe(true);
        expect(res.data.content).toBeTruthy();
        expect(res.data.messageId).toBeTruthy();
      }
    });

    test("real LLM respects maxTokens", { timeout: 60_000 }, async () => {
      await ensureServers();
      if (!llamaInstance) return;

      const res = await api.post<{ content: string; tokenUsage: { completionTokens: number } }>(
        "/api/generation/generate", {
          chatId: SEED.chat.id,
          parentMessageId: SEED.message.id,
          actorId: SEED.character.id,
          idempotencyKey: "real-llm-2",
          provider: "real-llama",
          prompt: [{ role: "user", content: "Write one short sentence." }],
          maxTokens: 20, temperature: 0,
        });

      expect(res.status).toBe(200);
      if (res.data) {
        expect(res.data.tokenUsage.completionTokens).toBeGreaterThan(0);
        expect(res.data.tokenUsage.completionTokens).toBeLessThanOrEqual(30);
      }
    });
  });

  // ── SD ───────────────────────────────────────────────────

  describe("sd-server", () => {
    test("health check returns samplers", { timeout: 10_000 }, async () => {
      await ensureServers();
      if (!sdInstance) return;

      const res = await fetch(`http://127.0.0.1:${sdPort}/sdapi/v1/samplers`);
      expect(res.ok).toBe(true);
      const data = (await res.json()) as Array<{ name: string }>;
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
      expect(data.some((s) => s.name === "euler_a")).toBe(true);
    });

    test("txt2img generates image", { timeout: 30_000 }, async () => {
      await ensureServers();
      if (!sdInstance) return;

      const res = await fetch(`http://127.0.0.1:${sdPort}/sdapi/v1/txt2img`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "a red square", negative_prompt: "",
          sampler_name: "euler_a", scheduler: "discrete",
          width: 64, height: 64, batch_size: 1, seed: 42, steps: 5, cfg_scale: 1,
        }),
      });

      expect(res.ok).toBe(true);
      const data = (await res.json()) as { images: string[] };
      expect(Array.isArray(data.images)).toBe(true);
      expect(data.images.length).toBeGreaterThan(0);
      expect(data.images[0].length).toBeGreaterThan(10);
      expect(data.images[0]).toMatch(/^[A-Za-z0-9+/]+=*$/);
    });

    test("handles missing prompt gracefully", { timeout: 10_000 }, async () => {
      await ensureServers();
      if (!sdInstance) return;

      const res = await fetch(`http://127.0.0.1:${sdPort}/sdapi/v1/txt2img`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  });
});
