/**
 * E2E: Export & Download Endpoints
 *
 * Tests chat export (JSON/MD), bulk data export (ZIP), and asset download.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { type ApiClient, createClient } from "../helpers/client";
import { SEED, seedAll } from "../helpers/seed";
import { createTestServer, type TestServer } from "../helpers/server";

describe("Export E2E", () => {
  let server: TestServer;
  let api: ApiClient;

  beforeAll(async () => {
    server = await createTestServer();
    api = createClient(server.url);
    await seedAll(server.db);
    await api.loginAs(SEED.user.username, SEED.user.password);
  });

  afterAll(() => {
    server.close();
  });

  describe("GET /api/chats/:id/export", () => {
    test("returns JSON export with Content-Disposition attachment", async () => {
      const res = await fetch(`${server.url}/api/chats/${SEED.chat.id}/export?format=json`, {
        headers: { Cookie: `ll_token=${api.token}` },
        redirect: "manual",
      });
      expect(res.ok).toBe(true);
      expect(res.headers.get("Content-Type")).toContain("application/json");
      expect(res.headers.get("Content-Disposition")).toContain("attachment; filename=");
      const body = await res.json() as { chat: { name: string }; messages: unknown[] };
      expect(body.chat.name).toBe(SEED.chat.name);
      expect(Array.isArray(body.messages)).toBe(true);
      expect(body.messages.length).toBeGreaterThanOrEqual(1);
    });

    test("returns Markdown export with Content-Disposition attachment", async () => {
      const res = await fetch(`${server.url}/api/chats/${SEED.chat.id}/export?format=md`, {
        headers: { Cookie: `ll_token=${api.token}` },
        redirect: "manual",
      });
      expect(res.ok).toBe(true);
      expect(res.headers.get("Content-Type")).toContain("text/markdown");
      expect(res.headers.get("Content-Disposition")).toContain("attachment; filename=");
      const body = await res.text();
      expect(body).toContain(`# ${SEED.chat.name}`);
      expect(body).toContain(SEED.message.content);
    });

    test("returns 404 for non-existent chat", async () => {
      const res = await fetch(`${server.url}/api/chats/ffffffff-ffff-4000-a000-deadbeefcafe/export?format=json`, {
        headers: { Cookie: `ll_token=${api.token}` },
        redirect: "manual",
      });
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/settings/export", () => {
    test("returns ZIP with Content-Disposition attachment", async () => {
      const res = await fetch(`${server.url}/api/settings/export`, {
        headers: { Cookie: `ll_token=${api.token}` },
        redirect: "manual",
      });
      expect(res.ok).toBe(true);
      expect(res.headers.get("Content-Type")).toBe("application/zip");
      expect(res.headers.get("Content-Disposition")).toContain("attachment; filename=");
      const buffer = await res.arrayBuffer();
      expect(buffer.byteLength).toBeGreaterThan(0);
      // ZIP magic bytes "PK\x03\x04"
      const magic = new Uint8Array(buffer).slice(0, 4);
      expect(magic[0]).toBe(0x50);
      expect(magic[1]).toBe(0x4B);
    });
  });

  describe("GET /api/assets/:id/download", () => {
    let assetId: string;

    beforeAll(async () => {
      // Write test file into the server's actual upload directory
      const uploadDir = server.config.assets.uploadDir;
      writeFileSync(resolve(uploadDir, "test-download.txt"), "hello world\n");

      // Insert asset into DB directly
      await server.db
        .insertInto("assets")
        .values({
          id: SEED.asset.id,
          filename: "test-download.txt",
          mime_type: "text/plain",
          asset_type: "other",
          size_bytes: 12,
          storage_path: "test-download.txt",
          storage_backend: "local",
          visibility: "public",
          owner_id: SEED.user.id,
        })
        .execute();

      assetId = SEED.asset.id;
    });

    test("returns file as download attachment", async () => {
      // Need the actual upload dir from config
      const res = await fetch(`${server.url}/api/assets/${assetId}/download`, {
        headers: { Cookie: `ll_token=${api.token}` },
        redirect: "manual",
      });
      expect(res.ok).toBe(true);
      expect(res.headers.get("Content-Disposition")).toContain("attachment; filename=");
      const text = await res.text();
      expect(text).toBe("hello world\n");
    });

    test("returns 404 for non-existent asset", async () => {
      const res = await fetch(`${server.url}/api/assets/ffffffff-ffff-4000-a000-deadbeefcafe/download`, {
        headers: { Cookie: `ll_token=${api.token}` },
        redirect: "manual",
      });
      expect(res.status).toBe(404);
    });
  });
});
