// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Gallery tab loader tests (split from characters.ts).
 *
 * loadCharacterGallery fetches linked avatars through the real feFetch +
 * safeFetch path, so the global fetch + document stubs installed here drive
 * the full request path (mirrors character-growth-editor.test.ts).
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";

import { loadCharacterGallery, } from "./characters-gallery";

const realFetch = globalThis.fetch;
const realDoc = globalThis.document;

let calls: string[] = [];

function modalWithGallery(slot: { innerHTML: string } | null,): HTMLElement {
  const stub = {
    querySelector: (sel: string,) => (sel === "[data-field='gallery']" ? slot : null),
  };

  // QuerySelector-only fake: loadCharacterGallery reads one slot, then sets innerHTML.
  const modal = stub as unknown as HTMLElement;

  return modal;
}

beforeEach(() => {
  calls = [];

  Object.assign(globalThis, {
    document: {
      cookie: "",
      createElement: () => {
        const node = {
          getHTML: () => node.textContent,
          textContent: "",
        };

        return node;
      },
      querySelector: () => null,
    },
    fetch: async (url: string,) => {
      calls.push(url,);

      return new Response(
        JSON.stringify([{ assetId: "av1", id: "1", label: "One", },],),
        { status: 200, },
      );
    },
  },);
},);

afterEach(() => {
  Object.assign(globalThis, { document: realDoc, fetch: realFetch, },);
},);

describe("loadCharacterGallery", () => {
  test("no gallery slot → no fetch", async () => {
    await loadCharacterGallery(modalWithGallery(null,), "a1",);

    expect(calls,).toEqual([],);
  });

  test("renders avatar thumbs with unlink controls", async () => {
    const gallery = { innerHTML: "", };

    await loadCharacterGallery(modalWithGallery(gallery,), "a1",);

    expect(calls,).toEqual(["/api/v1/actors/a1/avatars",],);
    expect(gallery.innerHTML,).toContain("/api/v1/assets/av1/thumb",);
    expect(gallery.innerHTML,).toContain("One",);
    expect(gallery.innerHTML,).toContain("unlink-asset",);
  });

  test("empty gallery shows the empty state", async () => {
    Object.assign(globalThis, {
      fetch: async () => new Response("[]", { status: 200, },),
    },);

    const gallery = { innerHTML: "", };

    await loadCharacterGallery(modalWithGallery(gallery,), "a1",);

    expect(gallery.innerHTML,).toContain("No linked assets.",);
  });

  test("fetch failure shows the error state", async () => {
    Object.assign(globalThis, {
      fetch: async () => {
        throw new Error("net",);
      },
    },);

    const gallery = { innerHTML: "", };

    await loadCharacterGallery(modalWithGallery(gallery,), "a1",);

    expect(gallery.innerHTML,).toContain("Failed to load gallery.",);
  });
});
