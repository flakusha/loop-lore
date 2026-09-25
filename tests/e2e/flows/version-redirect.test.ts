/**
 * E2E: API versioning redirects.
 *
 * Coverage for the /api/v1/ migration:
 *  - unversioned /api/{resource} → 308 → /api/v1/{resource} (single prefix)
 *  - already-versioned /api/v1/{resource} returns the routed response
 *    directly (no redirect — would otherwise loop /api/v1/x → /api/v1/v1/x)
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

  test("GET /api/v1/chats is served by the v1 barrel", async () => {
    const res = await fetch(`${server.url}/api/v1/chats`, { redirect: "manual", },);
    expect(res.status,).toBe(200,);
  });

  test("unversioned unknown /api/{resource} → 308 with single v1 prefix", async () => {
    const res = await fetch(`${server.url}/api/no-such-endpoint-xyz`, {
      method: "GET",
      redirect: "manual",
    },);
    expect(res.status,).toBe(308,);
    expect(res.headers.get("location",),).toBe("/api/v1/no-such-endpoint-xyz",);
  });

  test("already-versioned /api/v1/{resource} is NOT redirected (no double prefix)", async () => {
    const res = await fetch(`${server.url}/api/v1/no-such-endpoint-xyz`, {
      method: "GET",
      redirect: "manual",
    },);
    // /api/v1/* falls through to the v1 barrel, which 404s unknown paths
    expect(res.status,).not.toBe(308,);
    expect(res.status,).toBe(404,);
  });

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
    // Second hop must not redirect again (v1 barrel 404s unknown paths directly)
    expect(second.status,).not.toBe(308,);
    expect(second.headers.get("location",),).toBeNull();
  });
});
