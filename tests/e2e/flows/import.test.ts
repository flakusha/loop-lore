/**
 * E2E: Actor Import Endpoints
 *
 * Tests multipart file import: JSON, YAML, TOML, PNG, and error cases.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createTestServer, type TestServer } from "../helpers/server";
import { createClient, type ApiClient } from "../helpers/client";
import { seedUsers, SEED } from "../helpers/seed";

function makeJsonBlob(data: unknown, filename = "test.json"): File {
  return new File([JSON.stringify(data)], filename, { type: "application/json" });
}

function makeYamlBlob(data: unknown, filename = "test.yaml"): File {
  return new File([JSON.stringify(data)], filename, { type: "application/yaml" });
}

describe("Import E2E", () => {
  let server: TestServer;
  let api: ApiClient;

  beforeAll(async () => {
    server = await createTestServer();
    api = createClient(server.url);
    await seedUsers(server.db);
    await api.loginAs(SEED.user.username, SEED.user.password);
  });

  afterAll(() => {
    server.close();
  });

  test("POST /api/actors/import imports JSON actor", async () => {
    const file = makeJsonBlob({ name: "Imported JSON", description: "via multipart" }, "imported.json");
    const form = new FormData();
    form.append("file", file);

    const res = await api.upload<{ id: string }>("/api/actors/import", form);
    expect(res.ok).toBe(true);
    expect(res.data!.id).toBeTruthy();

    // Verify actor exists
    const getRes = await api.get<{ display_name: string }>(`/api/actors/${res.data!.id}`);
    expect(getRes.ok).toBe(true);
    expect(getRes.data!.display_name).toBe("Imported JSON");
  });

  test("POST /api/actors/import imports YAML actor", async () => {
    const file = makeYamlBlob({ name: "Imported YAML", description: "via multipart" }, "imported.yaml");
    const form = new FormData();
    form.append("file", file);

    const res = await api.upload<{ id: string }>("/api/actors/import", form);
    expect(res.ok).toBe(true);
    expect(res.data!.id).toBeTruthy();

    const getRes = await api.get<{ display_name: string }>(`/api/actors/${res.data!.id}`);
    expect(getRes.data!.display_name).toBe("Imported YAML");
  });

  test("POST /api/actors/import imports YML extension", async () => {
    const file = makeYamlBlob({ name: "Imported YML", description: "yml extension" }, "imported.yml");
    const form = new FormData();
    form.append("file", file);

    const res = await api.upload<{ id: string }>("/api/actors/import", form);
    expect(res.ok).toBe(true);

    const getRes = await api.get<{ display_name: string }>(`/api/actors/${res.data!.id}`);
    expect(getRes.data!.display_name).toBe("Imported YML");
  });

  test("POST /api/actors/import imports TOML actor", async () => {
    const toml = 'name = "Imported TOML"\ndescription = "via multipart"\n';
    const file = new File([toml], "test.toml", { type: "application/toml" });
    const form = new FormData();
    form.append("file", file);

    const res = await api.upload<{ id: string }>("/api/actors/import", form);
    expect(res.ok).toBe(true);

    const getRes = await api.get<{ display_name: string }>(`/api/actors/${res.data!.id}`);
    expect(getRes.data!.display_name).toBe("Imported TOML");
  });

  test("POST /api/actors/import rejects unsupported extension", async () => {
    const file = new File(["hello"], "test.txt", { type: "text/plain" });
    const form = new FormData();
    form.append("file", file);

    const res = await api.upload("/api/actors/import", form);
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
    expect(res.error).toContain("Unsupported file type");
  });

  test("POST /api/actors/import rejects missing file field", async () => {
    const form = new FormData();
    form.append("notfile", "value");

    const res = await api.upload("/api/actors/import", form);
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
    expect(res.error).toContain("file field is required");
  });

  test("POST /api/actors/import rejects invalid JSON", async () => {
    const file = new File(["{not json}"], "bad.json", { type: "application/json" });
    const form = new FormData();
    form.append("file", file);

    const res = await api.upload("/api/actors/import", form);
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
  });

  test("POST /api/actors/import rejects actor without name", async () => {
    const file = makeJsonBlob({ description: "nameless" }, "noname.json");
    const form = new FormData();
    form.append("file", file);

    const res = await api.upload("/api/actors/import", form);
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
    expect(res.error).toContain("Actor name is required");
  });
});
