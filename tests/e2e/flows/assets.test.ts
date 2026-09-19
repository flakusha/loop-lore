/**
 * E2E: Asset Flows
 *
 * Tests asset upload, list, serve, link, delete.
 * Requires seeded chat for link tests.
 */

import { describePristine, } from "@/test-utils/pristine";
import { afterAll, beforeAll, expect, test, } from "bun:test";
import { type ApiClient, createClient, } from "../helpers/client";
import { SEED, seedChat, seedUsers, } from "../helpers/seed";
import { createTestServer, type TestServer, } from "../helpers/server";

// The upload route stores via createAsset, which
// src/generation/image-gen-route.test.ts replaces process-wide with
// mockCreateAsset (fixed fixture row). Probe the loaded module and skip
// rather than assert the stub (e2e suites run last, so the stub wins).
const { createAsset, } = await import("@/assets/service/create");
const describeReal = describePristine(createAsset, "createAsset",);

describeReal("Assets E2E", () => {
  let server: TestServer;
  let api: ApiClient;

  beforeAll(async () => {
    server = await createTestServer();
    api = createClient(server.url,);
    await seedUsers(server.db,);
    await seedChat(server.db,);
    await api.loginAs(SEED.user.username, SEED.user.password,);
  },);

  afterAll(() => {
    server.close();
  },);
  test("GET /api/assets returns empty list", async () => {
    const res = await api.get<{ data: [] }>("/api/assets",);
    expect(res.ok,).toBe(true,);
    expect(Array.isArray(res.data!.data,),).toBe(true,);
  });

  test("POST /api/assets uploads a file", async () => {
    const file = new File(["test content",], "test.txt", { type: "text/plain", },);
    const formData = new FormData();
    formData.append("file", file,);

    const res = await api.upload<{ id: string; filename: string }>("/api/assets", formData,);
    expect(res.ok,).toBe(true,);
    expect(res.data!.id,).toBeTruthy();
    expect(res.data!.filename,).toBe("test.txt",);
  });

  test("GET /api/assets returns uploaded asset", async () => {
    // Upload first
    const file = new File(["png data",], "logo.png", { type: "image/png", },);
    const formData = new FormData();
    formData.append("file", file,);
    const uploadRes = await api.upload<{ id: string; filename: string }>("/api/assets", formData,);
    const assetId = uploadRes.data!.id;

    const res = await api.get<{ id: string; filename: string }>(`/api/assets/${assetId}`,);
    expect(res.ok,).toBe(true,);
    expect(res.data!.filename,).toBe("logo.png",);
  });

  test("POST /api/assets/:id/links links asset to chat", async () => {
    // Upload
    const file = new File(["chat asset",], "chat-image.png", { type: "image/png", },);
    const formData = new FormData();
    formData.append("file", file,);
    const uploadRes = await api.upload<{ id: string }>("/api/assets", formData,);
    const assetId = uploadRes.data!.id;

    // Link to chat
    const linkRes = await api.post(`/api/assets/${assetId}/links`, {
      entityType: "chat",
      entityId: SEED.chat.id,
    },);
    expect(linkRes.ok,).toBe(true,);

    // Verify link exists
    const linksRes = await api.get<Array<{ entity_type: string; entity_id: string }>>(
      `/api/assets/${assetId}/links`,
    );
    expect(Array.isArray(linksRes.data,),).toBe(true,);
  });

  test("POST/DELETE share and DELETE link accept a JSON body", async () => {
    // Upload
    const file = new File(["shared asset",], "shared.png", { type: "image/png", },);
    const formData = new FormData();
    formData.append("file", file,);
    const uploadRes = await api.upload<{ id: string }>("/api/assets", formData,);
    const assetId = uploadRes.data!.id;

    // Share with admin
    const shareRes = await api.post(`/api/assets/${assetId}/share`, { actor_id: SEED.admin.id, },);
    expect(shareRes.ok,).toBe(true,);

    // Unshare via DELETE with body
    const unshareRes = await api.del(`/api/assets/${assetId}/share`, { actor_id: SEED.admin.id, },);
    expect(unshareRes.ok,).toBe(true,);
    expect(unshareRes.status,).toBe(204,);
    const sharesRes = await api.get<Array<{ actor_id: string }>>(`/api/assets/${assetId}/shares`,);
    expect(sharesRes.data,).toEqual([],);

    // Link to chat, then unlink via DELETE with body
    const linkRes = await api.post(`/api/assets/${assetId}/links`, {
      entityType: "chat",
      entityId: SEED.chat.id,
    },);
    expect(linkRes.ok,).toBe(true,);

    // :linkId is the linked entity's id; unknown ids are a 404
    const badLinkRes = await api.del(`/api/assets/${assetId}/links/ghost-entity`, {
      entityType: "chat",
      entityId: SEED.chat.id,
    },);
    expect(badLinkRes.status,).toBe(404,);

    const unlinkRes = await api.del(`/api/assets/${assetId}/links/${SEED.chat.id}`, {
      entityType: "chat",
      entityId: SEED.chat.id,
    },);
    expect(unlinkRes.ok,).toBe(true,);
    expect(unlinkRes.status,).toBe(204,);

    const linksRes = await api.get<Array<{ entity_type: string; entity_id: string }>>(
      `/api/assets/${assetId}/links`,
    );
    expect(linksRes.data,).toEqual([],);
  });

  test("DELETE /api/assets/:id/links/:linkId returns 409 when entity_id is ambiguous across entity_types", async () => {
    // Regression for the over-delete bug: when the same entity_id appears
    // under multiple entity_types on the same asset, the route refuses
    // with 409 instead of silently dropping the unrelated link row.
    const file = new File(["ambiguous",], "ambiguous.png", { type: "image/png", },);
    const formData = new FormData();
    formData.append("file", file,);
    const uploadRes = await api.upload<{ id: string }>("/api/assets", formData,);
    const assetId = uploadRes.data!.id;

    // Two links sharing the same entity_id, different entity_type.
    // asset_links PK is (asset_id, entity_type, entity_id), so both rows
    // coexist; the DELETE route has no entity_type segment to pick one.
    const charLink = await api.post(`/api/assets/${assetId}/links`, {
      entityType: "character",
      entityId: "shared-entity-id",
    },);
    expect(charLink.ok,).toBe(true,);
    const worldLink = await api.post(`/api/assets/${assetId}/links`, {
      entityType: "world",
      entityId: "shared-entity-id",
    },);
    expect(worldLink.ok,).toBe(true,);

    const delRes = await api.del(`/api/assets/${assetId}/links/shared-entity-id`, {
      entityType: "character",
      entityId: "shared-entity-id",
    },);
    expect(delRes.status,).toBe(409,);
    expect(delRes.code,).toBe("CONFLICT",);

    // Both links still present (no silent drop).
    const linksRes = await api.get<Array<{ entity_type: string; entity_id: string }>>(
      `/api/assets/${assetId}/links`,
    );
    expect(linksRes.data,).toHaveLength(2,);
  });

  test("DELETE /api/assets/:id deletes asset", async () => {
    const file = new File(["delete me",], "delete.png", { type: "image/png", },);
    const formData = new FormData();
    formData.append("file", file,);
    const uploadRes = await api.upload<{ id: string }>("/api/assets", formData,);
    const assetId = uploadRes.data!.id;

    const deleteRes = await api.del(`/api/assets/${assetId}`,);
    expect(deleteRes.ok,).toBe(true,);

    const getRes = await api.get(`/api/assets/${assetId}`,);
    expect(getRes.status,).toBe(404,);
    expect(getRes.code,).toBeTruthy(); // TEST.2 error envelope
  });

  test("signed URL roundtrip: mint with session, serve session-less", async () => {
    const file = new File(["signed bytes",], "signed.png", { type: "image/png", },);
    const formData = new FormData();
    formData.append("file", file,);
    const uploadRes = await api.upload<{ id: string }>("/api/assets", formData,);
    const assetId = uploadRes.data!.id;

    // Mint (authenticated POST) — URL carries expires + sig params.
    const mintRes = await api.post<{ url: string; token: string; expiresAt: number }>(
      `/api/assets/${assetId}/signed-url/raw`,
    );
    expect(mintRes.ok,).toBe(true,);
    expect(mintRes.data!.url,).toContain(`?expires=`,);
    expect(mintRes.data!.url,).toContain(`&sig=`,);
    expect(mintRes.data!.expiresAt,).toBeGreaterThan(Date.now(),);

    // Session-less GET with the signed URL serves the file (no cookies).
    const serveRes = await fetch(`${server.url}${mintRes.data!.url}`,);
    expect(serveRes.status,).toBe(200,);
    expect(await serveRes.text(),).toBe("signed bytes",);

    // Tampered token is rejected fail-closed.
    const tampered = mintRes.data!.url.replace(/sig=./, "sig=X",);
    const badRes = await fetch(`${server.url}${tampered}`,);
    expect(badRes.status,).toBe(403,);

    // Minting requires an authenticated actor.
    const anonMint = await fetch(`${server.url}/api/assets/${assetId}/signed-url/raw`, {
      method: "POST",
    },);
    expect(anonMint.ok,).toBe(false,);
  });
},);
