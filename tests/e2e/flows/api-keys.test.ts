import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type ApiClient, createClient, } from "../helpers/client";
import { SEED, seedUsers, } from "../helpers/seed";
import { createTestServer, type TestServer, } from "../helpers/server";

describe("API Keys E2E", () => {
  let server: TestServer;
  let api: ApiClient;

  beforeAll(async () => {
    server = await createTestServer({
      auth: { required: true, },
      byoKey: { enabled: true, encryptionKey: "test-encryption-key-32bytes!", },
      generation: {
        defaultProvider: "test-provider",
        defaultModels: { "test-provider": "test-model", },
        providers: {
          openaiCompatible: [
            {
              name: "test-provider",
              label: "Test Provider",
              baseUrl: "http://localhost:9999",
              model: "test-model",
              timeout: 5000,
              retries: 0,
              allowUserApiKey: true,
              models: { "test-model": { contextLimit: 4096, maxOutput: 1024, }, },
            },
          ],
        },
      },
    },);
    api = createClient(server.url,);
    await seedUsers(server.db,);
    await api.loginAs(SEED.user.username, SEED.user.password,);
  },);

  afterAll(() => {
    server.close();
  },);

  test("GET /api/user-api-keys returns empty list initially", async () => {
    const res = await api.get<Array<{ provider_name: string }>>("/api/user-api-keys",);
    expect(res.ok,).toBe(true,);
    expect(Array.isArray(res.data,),).toBe(true,);
  });

  test("POST /api/user-api-keys stores a key (response has provider not provider_name)", async () => {
    const res = await api.post<{ id: string; provider: string }>("/api/user-api-keys", {
      providerName: "test-provider",
      apiKey: "sk-test-key-12345",
    },);
    expect(res.ok,).toBe(true,);
    expect(res.data!.provider,).toBe("test-provider",);
  });

  test("POST /api/user-api-keys requires providerName", async () => {
    const res = await api.post("/api/user-api-keys", { apiKey: "sk-test", },);
    expect(res.ok,).toBe(false,);
    expect(res.status,).toBe(422,);
  });

  test("POST /api/user-api-keys requires apiKey", async () => {
    const res = await api.post("/api/user-api-keys", { providerName: "test-provider", },);
    expect(res.ok,).toBe(false,);
    expect(res.status,).toBe(422,);
  });

  test("POST /api/user-api-keys rejects unknown provider", async () => {
    const res = await api.post("/api/user-api-keys", {
      providerName: "nonexistent",
      apiKey: "sk-test",
    },);
    expect(res.ok,).toBe(false,);
    expect(res.status,).toBe(400,);
  });

  test("GET /api/user-api-keys returns stored key metadata", async () => {
    const res = await api.get<Array<{ provider_name: string; created_at: string }>>(
      "/api/user-api-keys",
    );
    expect(res.ok,).toBe(true,);
    const keys = res.data!;
    expect(keys.some((k,) => k.provider_name === "test-provider"),).toBe(true,);
    for (const key of keys) {
      expect((key as Record<string, unknown>).api_key_encrypted,).toBeUndefined();
    }
  });

  test("POST /api/user-api-keys updates existing key (upsert)", async () => {
    const res = await api.post("/api/user-api-keys", {
      providerName: "test-provider",
      apiKey: "sk-updated-key",
    },);
    expect(res.ok,).toBe(true,);
  });

  test("DELETE /api/user-api-keys/:provider deletes key", async () => {
    const delRes = await api.del("/api/user-api-keys/test-provider",);
    expect(delRes.ok,).toBe(true,);

    const getRes = await api.get<Array<{ provider_name: string }>>("/api/user-api-keys",);
    expect(getRes.data!.some((k,) => k.provider_name === "test-provider"),).toBe(false,);
  });
});
