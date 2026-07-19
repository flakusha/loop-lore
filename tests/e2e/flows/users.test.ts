import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type ApiClient, createClient, } from "../helpers/client";
import { SEED, seedUsers, } from "../helpers/seed";
import { createTestServer, type TestServer, } from "../helpers/server";

describe("Users E2E", () => {
  let server: TestServer;
  let api: ApiClient;

  beforeAll(async () => {
    server = await createTestServer({ auth: { required: true, }, },);
    api = createClient(server.url,);
    await seedUsers(server.db,);
    await api.loginAs(SEED.user.username, SEED.user.password,);
  },);

  afterAll(() => {
    server.close();
  },);

  test("GET /api/users/me returns current user", async () => {
    const res = await api.get<{ id: string; username: string; role: string }>("/api/users/me",);
    expect(res.ok,).toBe(true,);
    expect(res.data!.username,).toBe(SEED.user.username,);
  });

  test("PUT /api/users/me updates display_name", async () => {
    const res = await api.put("/api/users/me", { displayName: "Updated Display", },);
    expect(res.ok,).toBe(true,);

    const getRes = await api.get<{ display_name: string }>("/api/users/me",);
    expect(getRes.data!.display_name,).toBe("Updated Display",);
  });

  test("PUT /api/users/:id/settings updates settings (returns settings object)", async () => {
    const res = await api.put<Record<string, unknown>>(`/api/users/${SEED.user.id}/settings`, {
      theme: "dark",
    },);
    expect(res.ok,).toBe(true,);
    expect(res.data!.theme,).toBe("dark",);
  });

  test("GET /api/users/:id returns 403 for non-admin", async () => {
    const res = await api.get(`/api/users/${SEED.user.id}`,);
    expect(res.status,).toBe(403,);
    expect(res.code,).toBeTruthy(); // TEST.2 error envelope
  });

  test("DELETE /api/users/:id returns 403 for non-admin", async () => {
    const res = await api.del(`/api/users/${SEED.user.id}`,);
    expect(res.status,).toBe(403,);
    expect(res.code,).toBeTruthy(); // TEST.2 error envelope
  });
});
