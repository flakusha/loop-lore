// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import { groupLoreEntries, parseLoreKeys, worldLore, } from "./world-lore";
import type { WorldLoreEntry, WorldPageState, } from "./world-types";

// ── Mock ../htmx (must precede importing side effects) ──
type ApiFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;
let calls: { url: string; opts: RequestInit }[] = [];
let handler: ApiFetchMock = async () => Response.json({ data: [], },);

const mockedApiFetch = (url: string, opts?: RequestInit,): Promise<Response> => {
  calls.push({ url, opts: opts ?? {}, },);
  return handler(url, opts,);
};

if (ISOLATED) {
  mock.module("./htmx", () => ({ apiFetch: mockedApiFetch, }),);
  // world-fetch.ts resolves the bare global at call time; point it at the
  // same mock so loadLore is intercepted too.
  const g = globalThis as unknown as { apiFetch?: ApiFetchMock };
  g.apiFetch = mockedApiFetch;
}

const entry = (over: Partial<WorldLoreEntry>,): WorldLoreEntry => ({
  id: "l1",
  name: null,
  content: "text",
  keys: null,
  enabled: "enabled",
  constant: 0,
  priority: 100,
  comment: null,
  ...over,
});

const loreCtx = (): WorldPageState => ({ worldId: "w1", ...worldLore, }) as WorldPageState;

afterEach(() => {
  handler = async () => Response.json({ data: [], },);
  calls = [];
  if (ISOLATED) {
    const g = globalThis as unknown as { apiFetch?: ApiFetchMock };
    delete g.apiFetch;
  }
},);

describeOrSkip("parseLoreKeys (pure)", () => {
  test("parses a JSON array of strings", () => {
    expect(parseLoreKeys('["dragon","age"]',),).toEqual(["dragon", "age",],);
  });

  test("returns empty for null, blank or non-array JSON", () => {
    expect(parseLoreKeys(null,),).toEqual([],);
    expect(parseLoreKeys("",),).toEqual([],);
    expect(parseLoreKeys('{"not":"array"}',),).toEqual([],);
    expect(parseLoreKeys("garbage",),).toEqual([],);
  });

  test("drops non-string members", () => {
    expect(parseLoreKeys('[1,"keep",null]',),).toEqual(["keep",],);
  });
},);

describeOrSkip("groupLoreEntries (pure)", () => {
  test("buckets constant, enabled and disabled entries", () => {
    const groups = groupLoreEntries([
      entry({ id: "c", constant: 1, },),
      entry({ id: "e", },),
      entry({ id: "d", enabled: "disabled", },),
    ],);

    expect(groups.constant.map((e,) => e.id),).toEqual(["c",],);
    expect(groups.enabled.map((e,) => e.id),).toEqual(["e",],);
    expect(groups.disabled.map((e,) => e.id),).toEqual(["d",],);
  });

  test("keeps unknown constant values out of the constant bucket", () => {
    const groups = groupLoreEntries([entry({ constant: null, },),],);
    expect(groups.constant,).toHaveLength(0,);
    expect(groups.enabled,).toHaveLength(1,);
  });
},);

describeOrSkip("worldLore.loadLore", () => {
  test("decodes the paginated lore list through the response schema", async () => {
    handler = async () =>
      Response.json({
        data: [entry({ keys: '["dragon"]', },),],
        total: 1,
        page: 1,
        pageSize: 500,
      },);

    const ctx = loreCtx();
    await worldLore.loadLore!.call(ctx,);
    expect(ctx.loreEntries,).toHaveLength(1,);
    expect(ctx.loreEntries[0]!.id,).toBe("l1",);
    expect(ctx.loreLoading,).toBe(false,);
  });

  test("falls back to empty on malformed payloads", async () => {
    handler = async () => Response.json({ data: [{ broken: true, },], },);
    const ctx = loreCtx();
    await worldLore.loadLore!.call(ctx,);
    expect(ctx.loreEntries,).toEqual([],);
  });

  test("flags the error on non-2xx", async () => {
    handler = async () => Response.json({}, { status: 500, },);
    const ctx = loreCtx();
    await worldLore.loadLore!.call(ctx,);
    expect(ctx.loreError,).toBe(true,);
  });
},);

describeOrSkip("worldLore.saveLore", () => {
  test("requires content before calling the API", async () => {
    const ctx = loreCtx();
    ctx.loreForm = { name: "", keys: "", content: "  ", priority: "100", constant: false, };
    await worldLore.saveLore!.call(ctx,);
    expect(calls,).toHaveLength(0,);
    expect(ctx.loreMessage,).toBe("Content is required.",);
  });

  test("creates via POST with camelCase payload", async () => {
    handler = async () => Response.json({ success: true, }, { status: 201, },);
    const ctx = loreCtx();
    ctx.loreForm = { name: "Dragons", keys: "dragon, wyrm", content: "Old lore.", priority: "42", constant: true, };
    await worldLore.saveLore!.call(ctx,);
    expect(calls,).toHaveLength(2,); // save + reload
    expect(calls[0]!.url,).toBe("/api/v1/worlds/w1/lore-entries",);
    const body = JSON.parse(String(calls[0]!.opts.body,),) as Record<string, unknown>;
    expect(body.content,).toBe("Old lore.",);
    expect(body.constant,).toBe(1,);
    expect(body.priority,).toBe(42,);
    expect(body.keys,).toEqual(["dragon", "wyrm",],);
    expect(ctx.loreFormOpen,).toBe(false,);
  });

  test("updates via PUT on the editing id", async () => {
    handler = async () => Response.json({ success: true, },);
    const ctx = loreCtx();
    ctx.loreEditingId = "l9";
    ctx.loreForm = { name: "n", keys: "", content: "c", priority: "100", constant: false, };
    await worldLore.saveLore!.call(ctx,);
    expect(calls[0]!.url,).toBe("/api/v1/worlds/w1/lore-entries/l9",);
    expect(calls[0]!.opts.method,).toBe("PUT",);
  });
},);

describeOrSkip("worldLore.deleteLore", () => {
  test("issues DELETE and reloads on 204", async () => {
    handler = async () => new Response(null, { status: 204, },);
    const ctx = loreCtx();
    await worldLore.deleteLore!.call(ctx, "l1",);
    expect(calls[0]!.url,).toBe("/api/v1/worlds/w1/lore-entries/l1",);
    expect(calls[0]!.opts.method,).toBe("DELETE",);
    expect(ctx.loreMessage,).toBe("",);
  });
},);
