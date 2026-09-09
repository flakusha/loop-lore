// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the peer advertisement fetch seam.
 *
 * Default implementation runs against a real loopback HTTP server —
 * no mocks for the success path.
 */
import { afterEach, describe, expect, test, } from "bun:test";
import {
  canonicalOrigin,
  fetchPeerAdvertisement,
  PEER_FETCH_TIMEOUT_MS,
} from "./peer-fetch";

let server: ReturnType<typeof Bun.serve> | null = null;

afterEach(() => {
  server?.stop();
  server = null;
},);

function serve(handler: (req: Request,) => Response | Promise<Response>,): string {
  server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: handler, },);
  return `http://127.0.0.1:${server.port}`;
}

describe("canonicalOrigin", () => {
  test("canonicalizes case and strips paths", () => {
    expect(canonicalOrigin("HTTPS://Example.COM:8443/some/path",),).toBe("https://example.com:8443",);
  });

  test("rejects non-http schemes, credentials, and garbage", () => {
    expect(canonicalOrigin("gopher://example.com",),).toBeNull();
    expect(canonicalOrigin("https://user:pass@example.com",),).toBeNull();
    expect(canonicalOrigin("not a url",),).toBeNull();
    expect(canonicalOrigin(42,),).toBeNull();
  });
});

describe("fetchPeerAdvertisement", () => {
  test("returns parsed body on 200 JSON", async () => {
    const origin = serve(() => Response.json({ peers: ["https://a.example.com",], },));
    const res = await fetchPeerAdvertisement(`${origin}/api/instance-state`, undefined,);
    expect(res.ok,).toBe(true,);
    expect(res.status,).toBe(200,);
    expect(res.body,).toEqual({ peers: ["https://a.example.com",], },);
  });

  test("non-JSON body is a miss (unparseable advertisements never heartbeat)", async () => {
    const origin = serve(() => new Response("not json{{{",));
    const res = await fetchPeerAdvertisement(`${origin}/api/instance-state`, undefined,);
    expect(res.ok,).toBe(false,);
    expect(res.body,).toBeNull();
  });

  test("HTTP errors surface as misses", async () => {
    const origin = serve(() => new Response("nope", { status: 500, },));
    const res = await fetchPeerAdvertisement(`${origin}/api/instance-state`, undefined,);
    expect(res.ok,).toBe(false,);
    expect(res.status,).toBe(500,);
    expect(res.body,).toBeNull();
  });

  test("unreachable peers surface as misses, never throw", async () => {
    const res = await fetchPeerAdvertisement("http://127.0.0.1:1/api/instance-state", undefined, 200,);
    expect(res.ok,).toBe(false,);
    expect(res.status,).toBe(0,);
  });

  test("CA bundle path works over plain HTTP", async () => {
    const origin = serve(() => Response.json({ peers: [], },));
    const res = await fetchPeerAdvertisement(`${origin}/api/instance-state`, { caBundle: "PEM", },);
    expect(res.ok,).toBe(true,);
  });

  test("default timeout constant is sane", () => {
    expect(PEER_FETCH_TIMEOUT_MS,).toBeGreaterThan(0,);
    expect(PEER_FETCH_TIMEOUT_MS,).toBeLessThanOrEqual(30_000,);
  });
});
