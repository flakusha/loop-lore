// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * E2E: BYO key round-trip + per-user KEK isolation.
 *
 * Tier 1 (always runs): store / list / delete through the HTTP API on an
 * ephemeral server, then open the sealed row through the per-user KEK path
 * (deriveUserKek + userId:provider AAD) — no credentials, no network.
 *
 * Tier 2 (creds-gated): with BYOK_E2E_API_KEY set, store a real vendor key
 * and run one tiny generation against it, then delete the key. Costs one
 * <=20-token completion — point at a small/cheap model.
 * Skip tier 2: leave BYOK_E2E_API_KEY blank or set BYOK_E2E_SKIP=1.
 * Creds template: `.credentials.env.example` (never commit `.credentials.env`).
 */
import { decryptValue, deriveUserKek, kekAad, } from "@/crypto";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type ApiClient, createClient, } from "../helpers/client";
import { SEED, seedAll, } from "../helpers/seed";
import { createTestServer, type TestServer, } from "../helpers/server";

const MASTER = "e2e-byok-master-secret-32bytes!!";
const PROVIDER = "byok-e2e";
const DUMMY_KEY = "sk-e2e-dummy-key";

const LIVE_BASE_URL = process.env.BYOK_E2E_BASE_URL ?? "https://openrouter.ai/api/v1";
const LIVE_HOST = new URL(LIVE_BASE_URL,).hostname;
const LIVE_KEY = process.env.BYOK_E2E_API_KEY ?? "";
const LIVE = LIVE_KEY !== "" && process.env.BYOK_E2E_SKIP !== "1";
const describeLive = LIVE ? describe : describe.skip;

describe("BYO key round-trip + KEK isolation (HTTP + ephemeral server)", () => {
  let server: TestServer;
  let api: ApiClient;

  beforeAll(async () => {
    server = await createTestServer({
      auth: { required: true, },
      byoKey: { enabled: true, encryptionKey: MASTER, },
      generation: {
        providers: {
          openaiCompatible: [{
            name: PROVIDER,
            label: "BYOK E2E",
            baseUrl: LIVE_BASE_URL,
            allowedHosts: [LIVE_HOST,],
            model: process.env.BYOK_E2E_MODEL ?? "openai/gpt-4o-mini",
            timeout: 30_000,
            retries: 0,
            allowUserApiKey: true,
            models: {},
          },],
        },
      },
    },);

    await seedAll(server.db,);
    api = createClient(server.url,);
    expect(await api.loginAs(SEED.user.username, SEED.user.password,),).toBe(true,);
  },);

  afterAll(async () => {
    if (server) { await server.close(); }
  },);

  test("stores through HTTP and opens the row via the per-user KEK", async () => {
    const store = await api.post("/api/v1/user-api-keys", {
      name: PROVIDER,
      provider: PROVIDER,
      api_key: DUMMY_KEY,
    },);

    expect(store.status,).toBe(200,);

    const list = await api.get<{ provider_name: string }[]>("/api/v1/user-api-keys",);
    expect(list.status,).toBe(200,);
    expect(list.data?.some((k,) => k.provider_name === PROVIDER),).toBe(true,);

    const row = await server.db
      .selectFrom("user_api_keys",)
      .selectAll()
      .where("provider_name", "=", PROVIDER,)
      .executeTakeFirst();

    expect(row,).toBeDefined();
    expect(row!.key_version,).toBe(3,);
    expect(row!.api_key_encrypted.startsWith("v3:",),).toBe(true,);

    const kek = await deriveUserKek(MASTER, row!.user_id,);
    await expect(decryptValue(row!.api_key_encrypted, kek, kekAad(row!.user_id, PROVIDER,),),).resolves.toBe(
      DUMMY_KEY,
    );

    const strangerKek = await deriveUserKek(MASTER, "someone-else",);
    await expect(decryptValue(row!.api_key_encrypted, strangerKek, kekAad("someone-else", PROVIDER,),),).rejects
      .toThrow();
  });

  test("another user sees nothing — list hides it, delete 404s", async () => {
    const adminApi = createClient(server.url,);
    expect(await adminApi.loginAs(SEED.admin.username, SEED.admin.password,),).toBe(true,);

    const list = await adminApi.get<{ provider_name: string }[]>("/api/v1/user-api-keys",);
    expect(list.status,).toBe(200,);
    expect(list.data?.some((k,) => k.provider_name === PROVIDER),).toBe(false,);

    const del = await adminApi.del(`/api/v1/user-api-keys/${PROVIDER}`,);
    expect(del.status,).toBe(404,);
  });

  test("owner deletes the key — second delete 404s", async () => {
    const del = await api.del(`/api/v1/user-api-keys/${PROVIDER}`,);
    expect(del.status,).toBe(204,);

    const gone = await api.del(`/api/v1/user-api-keys/${PROVIDER}`,);
    expect(gone.status,).toBe(404,);
  });

  describeLive("real vendor generation over the stored BYO key", () => {
    test("one tiny completion bills the user key, then the key is deleted", async () => {
      const store = await api.post("/api/v1/user-api-keys", {
        name: PROVIDER,
        provider: PROVIDER,
        api_key: LIVE_KEY,
      },);

      expect(store.status,).toBe(200,);

      try {
        const res = await api.post<{ ok: boolean; content: string }>("/api/v1/generation/generate", {
          chatId: SEED.chat.id,
          parentMessageId: SEED.message.id,
          actorId: SEED.character.id,
          idempotencyKey: `byok-e2e-live-${crypto.randomUUID()}`,
          provider: PROVIDER,
          prompt: [{ role: "user", content: "Reply with exactly: OK", },],
          maxTokens: 20,
          temperature: 0,
        },);

        expect(res.status,).toBe(200,);
        expect(res.data?.content,).toBeTruthy();
      } finally {
        await api.del(`/api/v1/user-api-keys/${PROVIDER}`,);
      }
    });
  },);
});
