// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Standalone enhance primitive — server fallback path and bounded undo.
 * Local inference stays opted-out so the server branch is exercised.
 */
import { afterEach, describe, expect, test, } from "bun:test";
import { enhanceText, UndoEnhance, } from "./text-enhance";

import type { ApiFetchMock, } from "../tests/test-types";

const globals = globalThis as unknown as { apiFetch?: ApiFetchMock };
const originalFetch = globals.apiFetch;

interface Captured {
  url: string;
  body: Record<string, unknown>;
}

function installFetch(status: number, payload: unknown,): Captured[] {
  const calls: Captured[] = [];
  globals.apiFetch = (url, init,) => {
    calls.push({ url, body: JSON.parse(String(init?.body ?? "{}",),) as Record<string, unknown>, },);
    return Promise.resolve(Response.json(payload, { status, },),);
  };

  return calls;
}

afterEach(() => {
  globals.apiFetch = originalFetch;
},);

describe("enhanceText", () => {
  test("returns server-improved content", async () => {
    installFetch(200, { data: { content: "polished", }, },);
    const result = await enhanceText({ text: "rough", level: "style-chat", chatId: "chat-1", },);
    expect(result,).toBe("polished",);
  });

  test("returns null on a failed request", async () => {
    installFetch(500, { message: "boom", },);
    const result = await enhanceText({ text: "rough", level: "style-chat", },);
    expect(result,).toBeNull();
  });

  test("omits chatId from the body when absent", async () => {
    const calls = installFetch(200, { data: { content: "polished", }, },);
    await enhanceText({ text: "rough", level: "style-chat", },);
    expect(calls.length,).toBe(1,);
    expect("chatId" in calls[0]!.body,).toBe(false,);
    expect(calls[0]!.body.text,).toBe("rough",);
  });
});

describe("UndoEnhance", () => {
  test("bounds depth and pops newest-first", () => {
    const undo = new UndoEnhance(5,);
    for (let i = 1; i <= 7; i += 1) {
      undo.push(`v${i}`,);
    }

    expect(undo.depth,).toBe(5,);
    expect(undo.pop(),).toBe("v7",);
    expect(undo.pop(),).toBe("v6",);
    expect(undo.pop(),).toBe("v5",);
    expect(undo.pop(),).toBe("v4",);
    expect(undo.pop(),).toBe("v3",);
    expect(undo.pop(),).toBeUndefined();
    expect(undo.depth,).toBe(0,);
  });
});
