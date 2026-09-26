// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * URL-shape tests for the character growth editor Alpine component.
 *
 * Pins actorId-via-query (not path) for arc/confirm/reject calls so the
 * FE-BE harmonization gate stays green: the backend reads actorId from
 * query validation on all three write endpoints.
 */
import { describe, expect, mock, test, } from "bun:test";

import { characterGrowthEditor, } from "./character-growth-editor";

let calls: { url: string; opts: RequestInit }[] = [];
let ok = true;
mock.module("./fe-fetch", () => ({
  feFetch: async (url: string, opts: RequestInit = {},) => {
    calls.push({ url, opts, },);
    return new Response("{}", { status: ok ? 200 : 500, },);
  },
  getCsrfToken: () => "",
}),);

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
