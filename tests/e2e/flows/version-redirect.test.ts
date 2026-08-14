/**
 * E2E: API versioning redirects.
 *
 * Regression coverage for the /api/v1/ migration:
 *  - unversioned /api/{resource} → 308 → /api/v1/{resource} (single prefix)
 *  - already-versioned /api/v1/{resource} is NEVER redirected (double-prefix
 *    loop guard: /api/v1/x → /api/v1/v1/x → 404)
 *  - barrel-served v1 routes answer directly
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { createTestServer, type TestServer, } from "../helpers/server";

describe("API versioning redirects", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await createTestServer({ auth: { required: false, }, },);
  },);

  afterAll(() => {
    server.close();
  },);

  test("GET /api/chats is served (legacy route still registered)", async () => {
    const res = await fetch(`${server.url}/api/chats`, { redirect: "manual", },);
    expect(res.status,).toBe(200,);
  },);

  test("GET /api/v1/chats is served by the v1 barrel", async () => {
    const res = await fetch(`${server.url}/api/v1/chats`, { redirect: "manual", },);
    expect(res.status,).toBe(200,);
  },);

  test("unversioned unknown /api/{resource} → 308 with single v1 prefix", async () => {
    const res = await fetch(`${server.url}/api/no-such-endpoint-xyz`, {
      method: "GET",
      redirect: "manual",
    },);
    expect(res.status,).toBe(308,);
    expect(res.headers.get("location",),).toBe("/api/v1/no-such-endpoint-xyz",);
  },);

  test("already-versioned /api/v1/{resource} is NOT redirected (no double prefix)", async () => {
    const res = await fetch(`${server.url}/api/v1/no-such-endpoint-xyz`, {
      method: "GET",
      redirect: "manual",
    },);
    // Must not 308 → /api/v1/v1/... — falls through to legacy dispatch → 404
    expect(res.status,).not.toBe(308,);
    expect(res.status,).toBe(404,);
  },);

  test("unversioned /api/{resource} redirect terminates at the v1 path", async () => {
    const first = await fetch(`${server.url}/api/no-such-endpoint-xyz`, {
      method: "GET",
      redirect: "manual",
    },);
    expect(first.status,).toBe(308,);
    const location = first.headers.get("location",) ?? "";
    const second = await fetch(`${server.url}${location}`, {
      method: "GET",
      redirect: "manual",
    },);
    // Second hop must not redirect again (previously: /api/v1/v1/... → 404 loop)
    expect(second.status,).not.toBe(308,);
    expect(second.headers.get("location",),).toBeNull();
  },);
});
