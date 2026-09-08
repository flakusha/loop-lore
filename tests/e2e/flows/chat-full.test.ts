/**
 * E2E: Chat Full Functionality
 *
 * Tests chat features beyond basic CRUD:
 *   - Asset loading linked to a chat
 *   - Regenerate/re-roll assistant response
 *   - Message swipe variants
 */

import { describePristine, } from "@/test-utils/pristine";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type ApiClient, createClient, } from "../helpers/client";
import { SEED, seedAll, } from "../helpers/seed";
import { createTestServer, type TestServer, } from "../helpers/server";

// Chat asset upload stores via createAsset, which
// src/generation/image-gen-route.test.ts replaces process-wide with
// mockCreateAsset. Probe and skip rather than assert the stub.
const { createAsset: probeCreateAsset, } = await import("@/assets/service/create");
const describeRealAsset = describePristine(probeCreateAsset, "createAsset",);

describe("Chat Full Functionality", () => {
  // ── Assets linked to chat ──────────────────────────────────

  describeRealAsset("chat assets", () => {
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

    test("uploads asset and links it to chat", async () => {
      const formData = new FormData();
      formData.append("file", new Blob(["hello world",],), "test.txt",);

      const uploadRes = await api.upload<{ id: string }>("/api/assets", formData,);
      expect(uploadRes.ok,).toBe(true,);
      expect(uploadRes.status,).toBe(201,);
      expect(uploadRes.data!.id,).toBeTruthy();

      const assetId = uploadRes.data!.id;

      // Link to chat
      const linkRes = await api.post(`/api/assets/${assetId}/links`, {
        entityType: "chat",
        entityId: SEED.chat.id,
        label: "test-attachment",
      },);
      expect(linkRes.ok,).toBe(true,);

      // List chat assets via entity filter
      const assetsRes = await api.get<{ data: Array<{ id: string }> }>(
        `/api/assets?entity_type=chat&entity_id=${SEED.chat.id}`,
      );
      expect(assetsRes.ok,).toBe(true,);
      expect(assetsRes.data!.data.length,).toBeGreaterThanOrEqual(1,);
      expect(assetsRes.data!.data.some((a,) => a.id === assetId),).toBe(true,);
    });
  },);

  // ── Regenerate / re-roll ───────────────────────────────────

  describe("regenerate", () => {
    let server: TestServer;
    let api: ApiClient;

    beforeAll(async () => {
      server = await createTestServer({}, true,); // registerMock = true
      await seedAll(server.db,);
      api = createClient(server.url,);
      await api.loginAs(SEED.user.username, SEED.user.password,);
    },);

    afterAll(() => {
      server.close();
    },);

    test("regenerates assistant response via generation endpoint", async () => {
      // Get initial messages
      const msgsBefore = await api.get<{ data: Array<{ id: string; role: string; content: string }> }>(
        `/api/chats/${SEED.chat.id}/messages`,
      );

      // Regenerate — replaces last assistant message
      const regenRes = await api.post<{ ok: boolean; chatId: string; ready: boolean }>(
        "/api/generation/regenerate",
        { chatId: SEED.chat.id, },
      );
      expect(regenRes.ok,).toBe(true,);
      expect(regenRes.data!.ok,).toBe(true,);
      expect(regenRes.data!.ready,).toBe(true,);

      // Messages list should still be valid
      const msgsAfter = await api.get<{ data: Array<{ id: string; role: string }> }>(
        `/api/chats/${SEED.chat.id}/messages`,
      );
      expect(msgsAfter.ok,).toBe(true,);
      expect(msgsAfter.data!.data.length,).toBeGreaterThanOrEqual(msgsBefore.data!.data.length,);
    });
  });

  // ── Swipe variants ─────────────────────────────────────────

  describe("swipe variants", () => {
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

    test("create message with assistant auto-reply and check variants", async () => {
      // Create a user message — assistant auto-reply is enabled by default
      const msgRes = await api.post<{ id: string; assistantMessage?: { id: string; content: string } }>(
        `/api/chats/${SEED.chat.id}/messages`,
        { content: "Hello from swipe test", },
      );
      expect(msgRes.ok,).toBe(true,);
      expect(msgRes.data!.id,).toBeTruthy();

      // The assistant auto-reply should have created a sibling with same parent_id
      // The user message id is msgRes.data.id, the assistant message is msgRes.data.assistantMessage.id

      // Get variants of the assistant message
      if (msgRes.data!.assistantMessage) {
        const assistantId = msgRes.data!.assistantMessage.id;
        const variantsRes = await api.get<Array<{ id: string; content: string }>>(
          `/api/messages/${assistantId}/variants`,
        );
        expect(variantsRes.ok,).toBe(true,);
        expect(variantsRes.status,).toBe(200,);
        // Should have at least the assistant message itself
        expect(Array.isArray(variantsRes.data,),).toBe(true,);
        expect(variantsRes.data!.length,).toBeGreaterThanOrEqual(1,);
      }
    });
  });
});
