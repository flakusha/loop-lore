// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import {
  actorWardrobeFactory,
  parseTagsInput,
} from "./actor-wardrobe";
import type { WardrobeOutfit, WardrobeVariant, } from "./actor-wardrobe-types";

// ── Mock apiFetch (actor-wardrobe imports htmx) ──
let fetchCalls: { url: string; opts: RequestInit }[] = [];
let fetchHandler: ((url: string, opts: RequestInit,) => Response) | null = null;

if (ISOLATED) {
  mock.module("./htmx", () => ({
    apiFetch: async (url: string, opts?: RequestInit,) => {
      fetchCalls.push({ url, opts: opts ?? {}, },);
      if (!fetchHandler) { return Response.json([],); }
      return fetchHandler(url, opts ?? {},);
    },
  }),);
}

afterEach(() => {
  fetchCalls = [];
  fetchHandler = null;
},);

const outfit = (id: string, name: string,): WardrobeOutfit => ({
  id,
  actorId: "a1",
  worldId: null,
  name,
  descriptor: "",
  tags: [],
  sortOrder: 0,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
});

const variant = (id: string, outfitId: string | null, emotion: string,): WardrobeVariant => ({
  id,
  assetId: "asset-1",
  label: "",
  tags: { emotion, },
  outfitId,
});

describeOrSkip("parseTagsInput", () => {
  test("trims, drops empties, splits on commas", () => {
    expect(parseTagsInput(" formal , royal ,, ",),).toEqual(["formal", "royal",],);
    expect(parseTagsInput("",),).toEqual([],);
  });
});

describeOrSkip("actorWardrobeFactory", () => {
  test("isolates state per instance", () => {
    const a = actorWardrobeFactory("a1",);
    const b = actorWardrobeFactory("a2",);
    a.outfits = [outfit("o1", "Court Dress",),];
    expect(b.outfits,).toEqual([],);
    expect(a._wActorId,).toBe("a1",);
    expect(b._wActorId,).toBe("a2",);
  });

  test("setActorId same id keeps state; different id resets", () => {
    const s = actorWardrobeFactory("a1",);
    s.message = "saved";
    s.setActorId("a1",);
    expect(s.message,).toBe("saved",);
    s.setActorId("a9",);
    expect(s.message,).toBe("",);
    expect(s.outfits,).toEqual([],);
  });
});

describeOrSkip("actorWardrobe.load", () => {
  test("loads outfits and variants together", async () => {
    const s = actorWardrobeFactory("a1",);
    fetchHandler = (url,) => url.endsWith("/avatars")
      ? Response.json([variant("v1", "o1", "happy",),],)
      : Response.json([outfit("o1", "Court Dress",),],);
    await s.load();
    expect(s.outfits,).toHaveLength(1,);
    expect(s.variants,).toHaveLength(1,);
    expect(s.loading,).toBe(false,);
    expect(s.loadError,).toBe("",);
    expect(fetchCalls.map((c,) => c.url,),).toEqual([
      "/api/v1/actors/a1/wardrobe",
      "/api/v1/actors/a1/avatars",
    ],);
  });

  test("wardrobe 5xx sets loadError, variants failure yields empty grid", async () => {
    const s = actorWardrobeFactory("a1",);
    fetchHandler = (url,) => url.endsWith("/avatars")
      ? Response.json({}, { status: 500, },)
      : Response.json({}, { status: 500, },);
    await s.load();
    expect(s.loadError,).not.toBe("",);
    expect(s.variants,).toEqual([],);
  });

  test("no-op without an actor id", async () => {
    const s = actorWardrobeFactory("a1",);
    s._wActorId = null;
    await s.load();
    expect(fetchCalls,).toHaveLength(0,);
  });
});

describeOrSkip("actorWardrobe.save", () => {
  test("rejects blank name without a network call", async () => {
    const s = actorWardrobeFactory("a1",);
    s.draft.name = "   ";
    await s.save();
    expect(s.error,).not.toBe("",);
    expect(fetchCalls,).toHaveLength(0,);
  });

  test("create posts to collection then reloads", async () => {
    const s = actorWardrobeFactory("a1",);
    s.draft.name = "Court Dress";
    s.draft.tagsInput = " formal ";
    fetchHandler = () => Response.json([outfit("o1", "Court Dress",),],);
    await s.save();
    const post = fetchCalls.find((c,) => c.opts.method === "POST",);
    expect(post?.url,).toBe("/api/v1/actors/a1/wardrobe",);
    expect(JSON.parse(post!.opts.body as string,),).toEqual({
      name: "Court Dress",
      descriptor: "",
      tags: ["formal",],
    },);
    expect(s.message,).toBe("status.wardrobeCreated",);
    expect(s.draft.name,).toBe("",);
  });

  test("update PUTs to the item and reports server message on failure", async () => {
    const s = actorWardrobeFactory("a1",);
    s.draft = { name: "Gown", descriptor: "", tagsInput: "", editingId: "o7", };
    fetchHandler = () => Response.json({ message: "name conflict", }, { status: 409, },);
    await s.save();
    const put = fetchCalls.find((c,) => c.opts.method === "PUT",);
    expect(put?.url,).toBe("/api/v1/actors/a1/wardrobe/o7",);
    expect(s.error,).toContain("conflict",);
    expect(s.draft.editingId,).toBe("o7",);
  });
});

describeOrSkip("actorWardrobe.remove", () => {
  test("deletes and reloads; 404 treated as success", async () => {
    const s = actorWardrobeFactory("a1",);
    s.draft.editingId = "o1";
    fetchHandler = (_url, opts,) => opts.method === "DELETE"
      ? Response.json({}, { status: 404, },)
      : Response.json([],);
    await s.remove("o1",);
    expect(fetchCalls[0]!.opts.method,).toBe("DELETE",);
    expect(s.error,).toBe("",);
    expect(s.draft.editingId,).toBeNull();
  });

  test("5xx sets delete error", async () => {
    const s = actorWardrobeFactory("a1",);
    fetchHandler = () => Response.json({}, { status: 500, },);
    await s.remove("o1",);
    expect(s.error,).toBe("status.wardrobeDeleteFailed",);
  });
});

describeOrSkip("actorWardrobe.variantGrid", () => {
  test("groups by outfit with base label for null outfit", () => {
    const s = actorWardrobeFactory("a1",);
    s.outfits = [outfit("o1", "Court Dress",),];
    s.variants = [
      variant("v1", "o1", "happy",),
      variant("v2", null, "neutral",),
      variant("v3", "o1", "angry",),
      variant("v4", "missing-outfit", "sad",),
    ];
    const grid = s.variantGrid();
    expect(grid,).toHaveLength(3,);
    const names = grid.map((g,) => g.outfitName,);
    expect(names,).toContain("Court Dress",);
    expect(names,).toContain("wardrobe.baseOutfit",);
    expect(names,).toContain("missing-outfit",);
    const dress = grid.find((g,) => g.outfitName === "Court Dress",);
    expect(dress!.variants,).toHaveLength(2,);
  });

  test("empty when no variants", () => {
    const s = actorWardrobeFactory("a1",);
    expect(s.variantGrid(),).toEqual([],);
  });
});
