// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Remote actor discovery — host-meta tolerance, WebFinger hop, actor fetch.
 *
 * Regression: a resolver that requires a peer to publish `/.well-known/host-meta`
 * (RFC 6415 flow) cannot resolve any peer that does not, even though RFC 7033
 * fixed WebFinger at `/.well-known/webfinger`. Every case here asserts the
 * resolver still completes when host-meta is absent, empty, or unparsable.
 *
 * Most cases stub the `fetchImpl` seam and DNS (`resolveHost`). The
 * `real fetch path` block deliberately does not: it runs the default fetch
 * against a loopback HTTP server so `safeFetch` status mapping is executed.
 */
import { afterEach, describe, expect, test, } from "bun:test";
import type { HostResolver, } from "../utils/url-validation";
import type { RemoteFetch, RemoteFetchResponse, } from "./remote-actor";
import { discoverWebFingerEndpoint, resolveRemoteActor, } from "./remote-actor";

const PEER = "https://remote.example";
const ACTOR_URI = `${PEER}/users/alice`;
const WEBFINGER_URL = `${PEER}/.well-known/webfinger?resource=acct%3Aalice%40remote.example`;

/** Public DNS answer — keeps `validateFetchUrl` off the resolver. */
const publicResolve: HostResolver = async () => ["93.184.216.34",];

const ACTOR_BODY = JSON.stringify({
  id: ACTOR_URI,
  type: "Person",
  preferredUsername: "alice",
  name: "Alice",
  inbox: `${ACTOR_URI}/inbox`,
  outbox: `${ACTOR_URI}/outbox`,
  followers: `${ACTOR_URI}/followers`,
  url: `https://remote.example/@alice`,
  publicKey: {
    id: `${ACTOR_URI}#main-key`,
    owner: ACTOR_URI,
    publicKeyPem: "-----BEGIN PUBLIC KEY-----\nkey\n-----END PUBLIC KEY-----",
  },
},);

const JRD_BODY = JSON.stringify({
  subject: "acct:alice@remote.example",
  links: [{ rel: "self", type: "application/activity+json", href: ACTOR_URI, },],
},);

interface StubRoute {
  status?: number;
  body?: string;
  /** Throw instead of answering — a dead peer. */
  fail?: boolean;
}

/** Build a fetch stub over a URL → response table and record every call. */
function stubFetch(routes: Record<string, StubRoute>,) {
  const calls: string[] = [];
  const fetchImpl: RemoteFetch = async (url,): Promise<RemoteFetchResponse> => {
    calls.push(url,);
    const route = routes[url];
    if (!route || route.fail) { throw new Error("unreachable",); }
    const status = route.status ?? 200;
    return { ok: status >= 200 && status < 300, status, body: route.body ?? "", };
  };

  return { fetchImpl, calls, };
}

let loopback: ReturnType<typeof Bun.serve> | null = null;

afterEach(() => {
  loopback?.stop(true,);
  loopback = null;
},);

/** Options for the loopback discovery peer. */
interface LoopbackPeer {
  /** Actor document served at `/users/:name`, or null to 404. */
  actor: string | null;
  /** Status for `/.well-known/host-meta` (default 404 — peer publishes none). */
  hostMeta?: number;
  /** Answer `/users/:name` with a 302 instead of a document. */
  redirectActor?: boolean;
}

/** Start a real discovery peer and return its origin. */
function servePeer(opts: LoopbackPeer,): string {
  loopback = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(request,) {
      const { pathname, } = new URL(request.url,);
      if (pathname === "/.well-known/host-meta") {
        return new Response("no host-meta here", { status: opts.hostMeta ?? 404, },);
      }

      if (pathname.startsWith("/users/",)) {
        if (opts.redirectActor) {
          return new Response(null, {
            status: 302,
            headers: { location: "https://elsewhere.example/users/alice", },
          },);
        }

        if (!opts.actor) { return new Response("missing", { status: 404, },); }
        return new Response(opts.actor, { headers: { "content-type": "application/activity+json", }, },);
      }

      return new Response("miss", { status: 404, },);
    },
  },);

  return `http://127.0.0.1:${loopback.port}`;
}

/** Routes with WebFinger + actor document, host-meta controlled per test. */
function peerRoutes(hostMeta: StubRoute | null,): Record<string, StubRoute> {
  const routes: Record<string, StubRoute> = {
    [WEBFINGER_URL]: { body: JRD_BODY, },
    [ACTOR_URI]: { body: ACTOR_BODY, },
  };

  if (hostMeta) { routes[`${PEER}/.well-known/host-meta`] = hostMeta; }
  return routes;
}

describe("resolveRemoteActor — host-meta is optional", () => {
  test("resolves a handle when the peer publishes no host-meta at all", async () => {
    const { fetchImpl, calls, } = stubFetch(peerRoutes(null,),);

    const result = await resolveRemoteActor("acct:alice@remote.example", {
      fetchImpl,
      resolveHost: publicResolve,
    },);

    expect(result.ok,).toBe(true,);
    if (!result.ok) { throw new Error(result.detail,); }
    expect(result.hostMeta,).toBe(false,);
    expect(result.actor.id,).toBe(ACTOR_URI,);
    expect(result.actor.preferredUsername,).toBe("alice",);
    expect(result.actor.inbox,).toBe(`${ACTOR_URI}/inbox`,);
    expect(result.actor.publicKey?.pem,).toContain("BEGIN PUBLIC KEY",);
    // host-meta 404 → the RFC 7033 default WebFinger path is used.
    expect(calls,).toEqual([`${PEER}/.well-known/host-meta`, WEBFINGER_URL, ACTOR_URI,],);
  });

  test("falls back to the default template when host-meta is HTML, not XRD", async () => {
    const { fetchImpl, calls, } = stubFetch(
      peerRoutes({ body: "<!doctype html><html><body>Not Found</body></html>", },),
    );

    const result = await resolveRemoteActor("acct:alice@remote.example", {
      fetchImpl,
      resolveHost: publicResolve,
    },);

    expect(result.ok,).toBe(true,);
    expect(result.ok && result.hostMeta,).toBe(false,);
    expect(calls[1],).toBe(WEBFINGER_URL,);
  });

  test("falls back when the host-meta request itself throws", async () => {
    const { fetchImpl, } = stubFetch(peerRoutes({ fail: true, },),);

    const result = await resolveRemoteActor("acct:alice@remote.example", {
      fetchImpl,
      resolveHost: publicResolve,
    },);

    expect(result.ok,).toBe(true,);
  });

  test("uses the lrdd template when the peer does publish host-meta", async () => {
    const custom = `${PEER}/webfinger?resource={uri}`;
    const routes = peerRoutes({
      body:
        `<?xml version="1.0"?><XRD xmlns="http://docs.oasis-open.org/ns/xri/xrd-1.0"><Link rel="lrdd" template="${custom}"/></XRD>`,
    },);

    routes[`${PEER}/webfinger?resource=acct%3Aalice%40remote.example`] = { body: JRD_BODY, };
    const { fetchImpl, calls, } = stubFetch(routes,);

    const result = await resolveRemoteActor("acct:alice@remote.example", {
      fetchImpl,
      resolveHost: publicResolve,
    },);

    expect(result.ok,).toBe(true,);
    expect(result.ok && result.hostMeta,).toBe(true,);
    expect(calls[1],).toBe(`${PEER}/webfinger?resource=acct%3Aalice%40remote.example`,);
  });
});

describe("resolveRemoteActor — failures are typed, never thrown", () => {
  test("webfinger 404 reports webfinger-unavailable", async () => {
    const { fetchImpl, } = stubFetch({},);

    const result = await resolveRemoteActor("acct:alice@remote.example", {
      fetchImpl,
      resolveHost: publicResolve,
    },);

    expect(result.ok,).toBe(false,);
    expect(result.ok ? null : result.reason,).toBe("webfinger-unavailable",);
  });

  test("JRD without a rel=self ActivityStreams link reports no-actor-link", async () => {
    const routes = peerRoutes(null,);
    routes[WEBFINGER_URL] = { body: JSON.stringify({ subject: "acct:alice@remote.example", links: [], },), };
    const { fetchImpl, } = stubFetch(routes,);

    const result = await resolveRemoteActor("acct:alice@remote.example", {
      fetchImpl,
      resolveHost: publicResolve,
    },);

    expect(result.ok ? null : result.reason,).toBe("no-actor-link",);
  });

  test("an actor document without an inbox is rejected as actor-invalid", async () => {
    const routes = peerRoutes(null,);
    routes[ACTOR_URI] = { body: JSON.stringify({ id: ACTOR_URI, type: "Person", },), };
    const { fetchImpl, } = stubFetch(routes,);

    const result = await resolveRemoteActor("acct:alice@remote.example", {
      fetchImpl,
      resolveHost: publicResolve,
    },);

    expect(result.ok ? null : result.reason,).toBe("actor-invalid",);
  });

  test("a non-acct, non-URL resource is invalid-resource", async () => {
    const { fetchImpl, calls, } = stubFetch({},);

    const result = await resolveRemoteActor("alice@remote.example", {
      fetchImpl,
      resolveHost: publicResolve,
    },);

    expect(result.ok ? null : result.reason,).toBe("invalid-resource",);
    expect(calls,).toEqual([],);
  });

  test("a handle whose host resolves to loopback is blocked-host", async () => {
    const { fetchImpl, calls, } = stubFetch(peerRoutes(null,),);
    const loopbackResolve: HostResolver = async () => ["127.0.0.1",];

    const result = await resolveRemoteActor("acct:alice@remote.example", {
      fetchImpl,
      resolveHost: loopbackResolve,
    },);

    expect(result.ok ? null : result.reason,).toBe("blocked-host",);
    expect(calls,).toEqual([],);
  });

  test("a host-meta template pointing at a private host is blocked", async () => {
    const routes = peerRoutes({
      body: `<XRD><Link rel="lrdd" template="http://127.0.0.1/.well-known/webfinger?resource={uri}"/></XRD>`,
    },);

    const fetchImpl: RemoteFetch = async (url,) => {
      if (url.includes("host-meta",)) {
        return { ok: true, status: 200, body: routes[`${PEER}/.well-known/host-meta`]?.body ?? "", };
      }

      return { ok: true, status: 200, body: JRD_BODY, };
    };

    const result = await resolveRemoteActor("acct:alice@remote.example", {
      fetchImpl,
      resolveHost: publicResolve,
    },);

    expect(result.ok ? null : result.reason,).toBe("blocked-host",);
  });

  test("an http-only host-meta template is blocked even for a public host", async () => {
    const fetchImpl: RemoteFetch = async (url,) => {
      if (url.includes("host-meta",)) {
        return {
          ok: true,
          status: 200,
          body: `<XRD><Link rel="lrdd" template="http://remote.example/.well-known/webfinger?resource={uri}"/></XRD>`,
        };
      }

      return { ok: true, status: 200, body: JRD_BODY, };
    };

    const result = await resolveRemoteActor("acct:alice@remote.example", {
      fetchImpl,
      resolveHost: publicResolve,
    },);

    expect(result.ok ? null : result.reason,).toBe("blocked-host",);
  });
});

describe("resolveRemoteActor — direct actor URI", () => {
  test("an absolute actor URI skips WebFinger entirely", async () => {
    const { fetchImpl, calls, } = stubFetch({ [ACTOR_URI]: { body: ACTOR_BODY, }, },);

    const result = await resolveRemoteActor(ACTOR_URI, { fetchImpl, resolveHost: publicResolve, },);

    expect(result.ok,).toBe(true,);
    expect(calls,).toEqual([ACTOR_URI,],);
    expect(result.ok && result.actor.name,).toBe("Alice",);
  });
});

describe("discoverWebFingerEndpoint", () => {
  test("returns the default template with source=default when host-meta is absent", async () => {
    const { fetchImpl, } = stubFetch({},);

    const endpoint = await discoverWebFingerEndpoint({ origin: PEER, fetchImpl, },);

    expect(endpoint.source,).toBe("default",);
    expect(endpoint.template,).toBe(`${PEER}/.well-known/webfinger?resource={uri}`,);
  });

  test("decodes an escaped template from host-meta", async () => {
    const { fetchImpl, } = stubFetch({
      [`${PEER}/.well-known/host-meta`]: {
        body: `<XRD><Link template="https://remote.example/wf?a=1&amp;resource={uri}" rel="lrdd"/></XRD>`,
      },
    },);

    const endpoint = await discoverWebFingerEndpoint({ origin: PEER, fetchImpl, },);

    expect(endpoint.source,).toBe("host-meta",);
    expect(endpoint.template,).toBe("https://remote.example/wf?a=1&resource={uri}",);
  });
});

// The default `RemoteFetch` (safeFetch in text mode) is the production path, and
// every case above stubs it. These run against a real loopback socket so the HTTP
// status → `{ ok, status, body }` mapping is executed instead of assumed.
describe("resolveRemoteActor — real fetch path", () => {
  test("fetches and validates an actor document over a real socket", async () => {
    const origin = servePeer({ actor: ACTOR_BODY, },);

    const result = await resolveRemoteActor(`${origin}/users/alice`, { allowPrivateHosts: true, },);

    expect(result.ok,).toBe(true,);
    if (!result.ok) { throw new Error(result.detail,); }
    expect(result.actor.id,).toBe(ACTOR_URI,);
    expect(result.actor.inbox,).toBe(`${ACTOR_URI}/inbox`,);
  });

  test("a 404 host-meta over the wire falls back to the default template", async () => {
    const origin = servePeer({ actor: ACTOR_BODY, hostMeta: 404, },);

    const endpoint = await discoverWebFingerEndpoint({ origin, },);

    expect(endpoint.source,).toBe("default",);
    expect(endpoint.template,).toBe(`${origin}/.well-known/webfinger?resource={uri}`,);
  });

  test("an unreachable actor URI is actor-unavailable, not a throw", async () => {
    const origin = servePeer({ actor: null, },);

    const result = await resolveRemoteActor(`${origin}/users/missing`, { allowPrivateHosts: true, },);

    expect(result.ok ? null : result.reason,).toBe("actor-unavailable",);
  });

  test("a redirect is refused rather than followed", async () => {
    const origin = servePeer({ actor: null, redirectActor: true, },);

    const result = await resolveRemoteActor(`${origin}/users/alice`, { allowPrivateHosts: true, },);

    expect(result.ok ? null : result.reason,).toBe("actor-unavailable",);
  });
});
