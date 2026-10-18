// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Federation panel component tests.
 *
 * The slice imports `apiFetch` from ./htmx, so the transport is stubbed with
 * `mock.module` (the convention for direct importers) rather than by
 * overwriting the global.
 *
 * Behaviours pinned here:
 * - the 403 path renders an error state, not a blank tab;
 * - a payload failing schema validation degrades to the empty default instead
 *   of throwing inside the tab;
 * - the typed-confirm gate rejects empty/mismatched origins, and a mismatched
 *   confirm never reaches the wire;
 * - the plaintext shared token is sent once and does not linger in state;
 * - a blank budget field becomes null (unlimited), never 0.
 */
import { beforeEach, describe, expect, mock, test, } from "bun:test";
import { adminFederation, FEDERATION_POLL_MS, } from "./admin-federation";

import type { ApiFetchMock, } from "../tests/test-types";

let calls: { url: string; opts: RequestInit }[] = [];
let handler: ApiFetchMock = async () => Response.json({},);

mock.module("./htmx", () => ({
  apiFetch: ((url: string, opts?: RequestInit,) => {
    calls.push({ url, opts: opts ?? {}, },);
    return handler(url, opts,);
  }) satisfies ApiFetchMock,
}),);

beforeEach(() => {
  calls = [];
  handler = async () => Response.json({},);
},);

/** Fresh component instance per test — the slice is a plain object literal. */
function fresh() {
  return { ...adminFederation, _fedPollTimer: null, };
}

/** A well-formed usage payload; the schema must accept it. */
const GOOD_USAGE = {
  enabled: true,
  peers: [{
    origin: "https://gpu.example",
    displayName: "GPU",
    state: "trusted",
    linkKind: "remote",
    instanceKind: "general",
    authMode: "tls",
    workloadTrust: true,
    stickyEnabled: false,
    allowedWorkloadClasses: ["chat",],
    advertisedWorkloadClasses: ["chat",],
    hasSharedToken: false,
    capacityBytes: null,
    classes: [{
      workloadClass: "chat",
      inFlight: 1,
      maxConcurrency: 4,
      headroom: 3,
      ewmaLatencyMs: null,
      circuitOpen: false,
      budget: null,
      quota: null,
    },],
  },],
  storage: { assetBytes: 10, heldBytes: 0, totalBytes: 10, assetCount: 2, budgetsAvailable: false, },
};

describe("admin federation — load", () => {
  test("loads the usage endpoint and projects peers", async () => {
    handler = async () => Response.json(GOOD_USAGE,);
    const state = fresh();
    await state.loadFederation();
    state.destroyFederation();

    expect(calls[0]?.url,).toBe("/api/v1/admin/federation/usage",);
    expect(state.fedUsage.enabled,).toBe(true,);
    expect(state.fedPeers[0]?.origin,).toBe("https://gpu.example",);
    expect(state.fedError,).toBe("",);
  });

  test("a 403 renders an error state rather than a blank panel", async () => {
    handler = async () => new Response("", { status: 403, },);
    const state = fresh();
    await state.loadFederation();
    state.destroyFederation();

    expect(state.fedForbidden,).toBe(true,);
    expect(state.fedError,).toBe("forbidden",);
  });

  test("a payload failing schema validation degrades to the empty default", async () => {
    // `enabled` is missing, so the schema check fails.
    handler = async () => Response.json({ nonsense: true, },);
    const state = fresh();
    await state.loadFederation();
    state.destroyFederation();

    expect(state.fedUsage.peers,).toEqual([],);
    expect(state.fedError,).toBe("",);
  });

  test("a network failure records an error instead of throwing", async () => {
    handler = async () => {
      throw new Error("offline",);
    };

    const state = fresh();
    await state.loadFederation();
    state.destroyFederation();

    expect(state.fedError,).toBe("usage_network",);
  });

  test("polling starts on load and destroyFederation stops it", async () => {
    handler = async () => Response.json(GOOD_USAGE,);
    const state = fresh();
    await state.loadFederation();

    expect(state._fedPollTimer,).not.toBeNull();
    expect(FEDERATION_POLL_MS,).toBe(30_000,);
    const before = calls.length;
    state.destroyFederation();
    expect(state._fedPollTimer,).toBeNull();
    expect(calls.length,).toBe(before,);
  });
});

describe("admin federation — delete typed-confirm", () => {
  test("an empty confirm cannot submit", () => {
    const state = fresh();
    state.fedDeleteOrigin = "https://gpu.example";
    state.fedDeleteConfirm = "";
    expect(state.fedDeleteConfirmed("https://gpu.example",),).toBe(false,);
  });

  test("a mismatched origin cannot submit", () => {
    const state = fresh();
    state.fedDeleteOrigin = "https://gpu.example";
    state.fedDeleteConfirm = "https://cpu.example";
    expect(state.fedDeleteConfirmed("https://gpu.example",),).toBe(false,);
  });

  test("an exact match submits", () => {
    const state = fresh();
    state.fedDeleteOrigin = "https://gpu.example";
    state.fedDeleteConfirm = "https://gpu.example";
    expect(state.fedDeleteConfirmed("https://gpu.example",),).toBe(true,);
  });

  test("a mismatched confirm never reaches the wire", async () => {
    const state = fresh();
    state.fedDeleteOrigin = "https://gpu.example";
    state.fedDeleteConfirm = "https://cpu.example";
    await state.deleteFederationPeer("https://gpu.example",);
    expect(calls,).toHaveLength(0,);
  });

  test("a confirmed delete calls DELETE and clears the confirm fields", async () => {
    handler = async () => Response.json(GOOD_USAGE,);
    const state = fresh();
    state.fedDeleteOrigin = "https://gpu.example";
    state.fedDeleteConfirm = "https://gpu.example";
    await state.deleteFederationPeer("https://gpu.example",);
    state.destroyFederation();

    const del = calls.find((c,) => c.opts.method === "DELETE");
    expect(del?.url,).toBe("/api/v1/admin/federation/peers/https%3A%2F%2Fgpu.example",);
    expect(state.fedDeleteConfirm,).toBe("",);
  });
});

describe("admin federation — peer save", () => {
  test("dispatches the right payload and clears the token afterwards", async () => {
    handler = async (url,) =>
      url.endsWith("/usage",)
        ? Response.json(GOOD_USAGE,)
        : Response.json({
          peer: GOOD_USAGE.peers[0],
          probe: { outcome: "reachable", reason: "", },
        },);

    const state = fresh();
    state.fedPeerDraft.origin = "https://gpu.example";
    state.fedPeerDraft.sharedToken = "secret-token";
    await state.saveFederationPeer();
    state.destroyFederation();

    const post = calls.find((c,) => c.opts.method === "POST");
    const body = JSON.parse(String(post?.opts.body,),);
    expect(body.origin,).toBe("https://gpu.example",);
    expect(body.sharedToken,).toBe("secret-token",);
    // One-way: the plaintext token does not linger in component state.
    expect(state.fedPeerDraft.sharedToken,).toBe("",);
    expect(state.fedProbeOutcome,).toBe("reachable",);
  });

  test("the probe verdict is surfaced from the save response", async () => {
    handler = async (url,) =>
      url.endsWith("/usage",)
        ? Response.json(GOOD_USAGE,)
        : Response.json({
          peer: GOOD_USAGE.peers[0],
          probe: { outcome: "unreachable", reason: "connection refused", },
        },);

    const state = fresh();
    state.fedPeerDraft.origin = "https://gpu.example";
    await state.saveFederationPeer();
    state.destroyFederation();

    expect(state.fedProbeOutcome,).toBe("unreachable",);
    expect(state.fedProbeReason,).toBe("connection refused",);
  });

  test("a refused save still clears the token from component state", async () => {
    handler = async (url,) =>
      url.endsWith("/usage",)
        ? Response.json(GOOD_USAGE,)
        : new Response("", { status: 422, },);

    const state = fresh();
    state.fedPeerDraft.origin = "http://gpu.example";
    state.fedPeerDraft.sharedToken = "secret-token";
    await state.saveFederationPeer();
    state.destroyFederation();

    expect(state.fedError,).toBe("peer_422",);
    expect(state.fedPeerDraft.sharedToken,).toBe("",);
    expect(state.fedProbeOutcome,).toBe("",);
  });
});

describe("admin federation — budget save", () => {
  test("a blank limit is sent as null (unlimited), never 0", async () => {
    handler = async (url,) => url.endsWith("/usage",) ? Response.json(GOOD_USAGE,) : Response.json({},);
    const state = fresh();
    state.fedBudgetDraft.origin = "https://gpu.example";
    state.fedBudgetDraft.workloadClass = "chat";
    state.fedBudgetDraft.maxConcurrency = "";
    state.fedBudgetDraft.requestsPerMinute = "60";
    await state.saveFederationBudget();
    state.destroyFederation();

    const put = calls.find((c,) => c.opts.method === "PUT");
    const body = JSON.parse(String(put?.opts.body,),);
    expect(body.maxConcurrency,).toBeNull();
    expect(body.requestsPerMinute,).toBe(60,);
    expect(body.tokensPerMinute,).toBeNull();
    expect(body.maxQueueDepth,).toBeNull();
  });
});

describe("admin federation — matrix save", () => {
  test("round-trips the preference map", async () => {
    const stored = { matrix: { preferences: { chat: ["https://gpu.example",], }, }, };
    handler = async () => Response.json(stored,);
    const state = fresh();
    state.fedMatrix = { chat: ["https://gpu.example",], };
    await state.saveFederationMatrix();

    expect(state.fedMatrix.chat,).toEqual(["https://gpu.example",],);
    const put = calls.find((c,) => c.opts.method === "PUT");
    expect(JSON.parse(String(put?.opts.body,),).preferences.chat,).toEqual(["https://gpu.example",],);
  });
});
