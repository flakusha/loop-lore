// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for frontend/vn/choice-cards-consequences.ts — the split/reunite
 * consequence parser and its best-effort endpoint triggers, called directly
 * (mock-module seam convention, matching choice-cards-effects.test.ts).
 */
import { afterEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import {
  extractReunionSource,
  extractSplitBranches,
  triggerReunite,
  triggerSplit,
} from "./choice-cards-consequences";

// ── Mock feFetch ────────────────────────────────────────────────────────────

let feCalls: { url: string; opts: RequestInit }[] = [];
let feHandler: ((url: string, opts: RequestInit,) => Response) | null = null;

if (ISOLATED) {
  mock.module("../fe-fetch", () => ({
    feFetch: async (url: string, opts?: RequestInit,) => {
      feCalls.push({ url, opts: opts ?? {}, },);
      if (!feHandler) { return new Response("{}", { status: 200, },); }
      return feHandler(url, opts ?? {},);
    },
    getCsrfToken: () => "",
  }),);
}

/** */
function jsonRes(body: unknown, status = 200,): Response {
  return Response.json(body, { status, },);
}

afterEach(() => {
  feHandler = null;
  feCalls = [];
},);

// ── extractSplitBranches ────────────────────────────────────────────────────

describeOrSkip("extractSplitBranches", () => {
  test("returns the parsed branches of a well-formed split consequence", () => {
    const branches = [{ locationId: "loc-a", actorIds: ["x", "y",], }, { locationId: "loc-b", actorIds: ["z",], },];
    expect(extractSplitBranches({ action: "split", branches, },),).toEqual(branches,);
  });

  test("is a no-match for any other action, even with valid branches", () => {
    const branches = [{ locationId: "a", actorIds: ["x",], }, { locationId: "b", actorIds: ["y",], },];
    expect(extractSplitBranches({ action: "reunite", branches, secondaryChatId: "c2", },),).toBeNull();
    expect(extractSplitBranches({ branches, },),).toBeNull();
  });

  test("is a no-match when branches is missing or not an array", () => {
    expect(extractSplitBranches({ action: "split", },),).toBeNull();
    expect(extractSplitBranches({ action: "split", branches: "loc-a", },),).toBeNull();
    expect(extractSplitBranches({ action: "split", branches: null, },),).toBeNull();
  });

  test("drops malformed entries and keeps only string actor ids", () => {
    const out = extractSplitBranches({
      action: "split",
      branches: [
        null,
        "junk",
        { locationId: 7, actorIds: ["q",], },
        { locationId: "loc-a", actorIds: "x", },
        { locationId: "loc-b", actorIds: [1, "z", {},], },
        { locationId: "loc-c", actorIds: [], },
        { locationId: "loc-d", actorIds: ["w",], },
      ],
    },);

    expect(out,).toEqual([
      { locationId: "loc-b", actorIds: ["z",], },
      { locationId: "loc-d", actorIds: ["w",], },
    ],);
  });

  test("needs two surviving branches — one valid branch is not a split", () => {
    expect(
      extractSplitBranches({ action: "split", branches: [{ locationId: "loc-a", actorIds: ["x",], },], },),
    ).toBeNull();

    // Every entry filtered out leaves nothing to split into.
    expect(extractSplitBranches({ action: "split", branches: [{ locationId: 1, actorIds: [], },], },),).toBeNull();
  });
},);

// ── extractReunionSource ────────────────────────────────────────────────────

describeOrSkip("extractReunionSource", () => {
  test("returns the secondary chat id of a reunite consequence", () => {
    expect(extractReunionSource({ action: "reunite", secondaryChatId: "chat-2", },),).toBe("chat-2",);
  });

  test("is a no-match when the id is missing or not a string", () => {
    expect(extractReunionSource({ action: "reunite", },),).toBeNull();
    expect(extractReunionSource({ action: "reunite", secondaryChatId: 42, },),).toBeNull();
    expect(extractReunionSource({ action: "reunite", secondaryChatId: null, },),).toBeNull();
  });

  test("is a no-match for any other action, even with an id present", () => {
    expect(extractReunionSource({ action: "split", secondaryChatId: "chat-2", },),).toBeNull();
    expect(extractReunionSource({ secondaryChatId: "chat-2", },),).toBeNull();
    expect(extractReunionSource({},),).toBeNull();
  });
},);

// ── triggerSplit ───────────────────────────────────────────────────────────

describeOrSkip("triggerSplit", () => {
  const branches = [{ locationId: "loc-a", actorIds: ["x",], }, { locationId: "loc-b", actorIds: ["y",], },];

  test("POSTs the branches to the chat split endpoint and reports ok", async () => {
    expect(await triggerSplit("chat-1", branches,),).toBe(true,);
    expect(feCalls.length,).toBe(1,);
    expect(feCalls[0]!.url,).toBe("/api/v1/chats/chat-1/split",);
    expect(feCalls[0]!.opts.method,).toBe("POST",);
    expect(feCalls[0]!.opts.headers,).toEqual({ "Content-Type": "application/json", },);
    expect(JSON.parse(String(feCalls[0]!.opts.body,),),).toEqual({ branches, },);
  });

  test("reports false when the endpoint answers non-ok", async () => {
    feHandler = () => jsonRes({ error: "no", }, 500,);
    expect(await triggerSplit("chat-1", branches,),).toBe(false,);
    expect(feCalls.length,).toBe(1,);
  });

  test("swallows a thrown fetch and reports false", async () => {
    feHandler = () => {
      throw new Error("boom",);
    };

    expect(await triggerSplit("chat-1", branches,),).toBe(false,);
  });
},);

// ── triggerReunite ──────────────────────────────────────────────────────────

describeOrSkip("triggerReunite", () => {
  test("POSTs the secondary chat id to the chat reunite endpoint and reports ok", async () => {
    expect(await triggerReunite("chat-1", "chat-2",),).toBe(true,);
    expect(feCalls.length,).toBe(1,);
    expect(feCalls[0]!.url,).toBe("/api/v1/chats/chat-1/reunite",);
    expect(feCalls[0]!.opts.method,).toBe("POST",);
    expect(feCalls[0]!.opts.headers,).toEqual({ "Content-Type": "application/json", },);
    expect(JSON.parse(String(feCalls[0]!.opts.body,),),).toEqual({ secondaryChatId: "chat-2", },);
  });

  test("reports false when the endpoint answers non-ok", async () => {
    feHandler = () => jsonRes({ error: "no", }, 500,);
    expect(await triggerReunite("chat-1", "chat-2",),).toBe(false,);
    expect(feCalls.length,).toBe(1,);
  });

  test("swallows a thrown fetch and reports false", async () => {
    feHandler = () => {
      throw new Error("boom",);
    };

    expect(await triggerReunite("chat-1", "chat-2",),).toBe(false,);
  });
},);
