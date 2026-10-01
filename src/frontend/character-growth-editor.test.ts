// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * URL-shape tests for the character growth editor Alpine component.
 *
 * Pins actorId-via-query (not path) for arc/confirm/reject calls so the
 * FE-BE harmonization gate stays green: the backend reads actorId from
 * query validation on all three write endpoints.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";

import { characterGrowthEditor, type GrowthLogEntry, } from "./character-growth-editor";

let calls: { url: string; opts: RequestInit }[] = [];
let ok = true;
let fail = false;
// Real fe-fetch + safeFetch: the global fetch stub installed in beforeEach
// drives the full request path (CSRF header injection, error propagation).
type FetchOpts = Record<string, unknown>;
let fetchImpl: (url: string, opts?: FetchOpts,) => Promise<Response> = async () =>
  new Response("{}", { status: 200, },);
const realFetch = globalThis.fetch;
const realDoc = globalThis.document;

beforeEach(() => {
  calls = [];
  ok = true;
  fail = false;
  fetchImpl = async () => {
    if (fail) { throw new Error("network",); }
    return new Response("{}", { status: ok ? 200 : 500, },);
  };
  (globalThis as { fetch: unknown }).fetch = (url: string, opts?: FetchOpts,) => {
    calls.push({ url, opts: opts as RequestInit, },);
    return fetchImpl(url, opts,);
  };
  (globalThis as { document: unknown }).document = {
    querySelector: () => null,
    cookie: "",
  };
},);

afterEach(() => {
  (globalThis as { fetch: unknown }).fetch = realFetch;
  (globalThis as { document: unknown }).document = realDoc;
},);

function editor() {
  return characterGrowthEditor({
    actorId: "a1",
    initialMode: "dynamic",
    initialLlmAssist: false,
    initialArcStage: "introduction",
    initialArcDescription: "",
    initialEntries: [{ id: "e1", recordedAt: "t", axis: "trait", eventType: "x", reason: "r", status: "pending", },],
  },);
}

describe("characterGrowthEditor URL shapes", () => {
  test("saveArc PATCHes query actorId", async () => {
    calls = [];
    const c = editor();
    await c.saveArc();
    expect(calls.length,).toBe(1,);
    const [call,] = calls;
    expect(call!.url,).toBe("/api/v1/character-growth/arc?actorId=a1",);
    expect(call!.opts.method,).toBe("PATCH",);
    expect(c.message,).toBe("Arc saved.",);
  });

  test("confirm/reject POST query actorId and flip status", async () => {
    calls = [];
    const c = editor();
    await c.confirmEntry("e1",);
    expect(calls[0]!.url,).toBe("/api/v1/character-growth/growth-log/e1/confirm?actorId=a1",);
    expect(c.entries[0]!.status,).toBe("applied",);
    await c.rejectEntry("e1",);
    expect(calls[1]!.url,).toBe("/api/v1/character-growth/growth-log/e1/reject?actorId=a1",);
    expect(c.entries[0]!.status,).toBe("rejected",);
  });

  test("saveArc failure surfaces a message", async () => {
    calls = [];
    ok = false;
    const c = editor();
    await c.saveArc();
    expect(c.message,).toBe("Failed to save arc.",);
    ok = true;
  });
});

describe("characterGrowthEditor saveMode", () => {
  test("PUTs growthMode + llmAssistEnabled and reports saved", async () => {
    calls = [];
    const c = editor();
    await c.saveMode();
    expect(calls[0]!.url,).toBe("/api/v1/actors/a1",);
    expect(calls[0]!.opts.method,).toBe("PUT",);
    expect((calls[0]!.opts.headers as Headers).get("Content-Type",),).toBe("application/json",);
    expect(JSON.parse(String(calls[0]!.opts.body,),),).toEqual({ growthMode: "dynamic", llmAssistEnabled: false, },);
    expect(c.message,).toBe("Saved.",);
  });

  test("network failure reports failure", async () => {
    fail = true;
    const c = editor();
    await c.saveMode();
    expect(c.message,).toBe("Failed to save growth mode.",);
    fail = false;
  });

  test("actorId is URL-encoded", async () => {
    calls = [];
    const c = characterGrowthEditor({
      actorId: "a b/c",
      initialMode: "dynamic",
      initialLlmAssist: false,
      initialArcStage: "introduction",
      initialArcDescription: "",
      initialEntries: [],
    },);
    await c.saveMode();
    expect(calls[0]!.url,).toBe("/api/v1/actors/a%20b%2Fc",);
  });
});

describe("characterGrowthEditor confirm/reject failure paths", () => {
  test("confirm failure keeps status pending", async () => {
    fail = true;
    const c = editor();
    await c.confirmEntry("e1",);
    expect(c.message,).toBe("Failed to confirm entry.",);
    expect(c.entries[0]!.status,).toBe("pending",);
    fail = false;
  });

  test("reject failure keeps status pending", async () => {
    fail = true;
    const c = editor();
    await c.rejectEntry("e1",);
    expect(c.message,).toBe("Failed to reject entry.",);
    expect(c.entries[0]!.status,).toBe("pending",);
    fail = false;
  });

  test("entryId is URL-encoded in confirm/reject", async () => {
    calls = [];
    const c = characterGrowthEditor({
      actorId: "a1",
      initialMode: "dynamic",
      initialLlmAssist: false,
      initialArcStage: "introduction",
      initialArcDescription: "",
      initialEntries: [{ id: "e 1/2", recordedAt: "t", axis: "a", eventType: "x", reason: "r", status: "pending", },],
    },);
    await c.confirmEntry("e 1/2",);
    expect(calls[0]!.url,).toBe("/api/v1/character-growth/growth-log/e%201%2F2/confirm?actorId=a1",);
  });
});

describe("characterGrowthEditor _updateEntryStatus", () => {
  test("unknown id leaves entries untouched", () => {
    const c = editor();
    c._updateEntryStatus("nope", "applied",);
    expect(c.entries[0]!.status,).toBe("pending",);
  });
});

describe("characterGrowthEditor option coercion", () => {
  test("empty arc stage defaults to introduction", () => {
    const c = characterGrowthEditor({
      actorId: "a1",
      initialMode: "dynamic",
      initialLlmAssist: false,
      initialArcStage: "",
      initialArcDescription: "",
      initialEntries: [],
    },);
    expect(c.arcStage,).toBe("introduction",);
  });

  test("non-array initialEntries becomes an empty array", () => {
    const c = characterGrowthEditor({
      actorId: "a1",
      initialMode: "dynamic",
      initialLlmAssist: false,
      initialArcStage: "introduction",
      initialArcDescription: "",
      initialEntries: null as unknown as GrowthLogEntry[],
    },);
    expect(c.entries,).toEqual([],);
  });

  test("truthy llm assist coerces to boolean true", () => {
    const c = characterGrowthEditor({
      actorId: "a1",
      initialMode: "dynamic",
      initialLlmAssist: 1 as unknown as boolean,
      initialArcStage: "introduction",
      initialArcDescription: "",
      initialEntries: [],
    },);
    expect(c.llmAssistEnabled,).toBe(true,);
  });
});

describe("characterGrowthEditor saveArc body", () => {
  test("PATCHes currentStage + stageDescription", async () => {
    calls = [];
    const c = editor();
    c.arcStage = "rising";
    c.arcDescription = "A new chapter";
    await c.saveArc();
    expect(JSON.parse(String(calls[0]!.opts.body,),),).toEqual({
      currentStage: "rising",
      stageDescription: "A new chapter",
    },);
  });
});
