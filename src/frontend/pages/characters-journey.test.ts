// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Journey loader tests (split from characters.ts).
 *
 * initJourney injects the fetch seam directly, so no global fetch stub is
 * needed; the document stub serves shared.ts escapeHtml's
 * createElement/getHTML path.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";

import { initJourney, loadCharacterJourney, } from "./characters-journey";

const realDoc = globalThis.document;

let calls: string[] = [];
let routes: Record<string, () => Response> = {};

function modalWithJourney(slot: { innerHTML: string } | null,): HTMLElement {
  const stub = {
    querySelector: (sel: string,) => (sel === "[data-field='journey']" ? slot : null),
  };

  // QuerySelector-only fake: loadCharacterJourney reads one slot, then sets innerHTML.
  const modal = stub as unknown as HTMLElement;

  return modal;
}

beforeEach(() => {
  calls = [];
  routes = {};

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
  },);

  initJourney(async (url: string,) => {
    calls.push(url,);
    const entries = Object.entries(routes,).sort((a, b,) => b[0].length - a[0].length);

    for (const [prefix, fn,] of entries) {
      if (url.startsWith(prefix,)) { return fn(); }
    }

    return new Response("{}", { status: 200, },);
  },);
},);

afterEach(() => {
  Object.assign(globalThis, { document: realDoc, },);
},);

describe("loadCharacterJourney", () => {
  test("no journey slot → no fetch", async () => {
    routes = {
      "/api/v1/character-growth/arc": () => new Response("{}", { status: 200, },),
    };

    await loadCharacterJourney(modalWithJourney(null,), "a1",);

    expect(calls,).toEqual([],);
  });

  test("missing arc shows the empty state", async () => {
    routes = {
      "/api/v1/character-growth/arc": () => new Response(JSON.stringify({ arc: null, },), { status: 200, },),
    };

    const journey = { innerHTML: "", };

    await loadCharacterJourney(modalWithJourney(journey,), "a1",);

    expect(journey.innerHTML,).toContain("No growth recorded yet.",);
  });

  test("arc + entries render the stage and reasons", async () => {
    routes = {
      "/api/v1/character-growth/arc": () =>
        new Response(
          JSON.stringify({ arc: { currentStage: "crisis", stageDescription: "The fall", }, },),
          { status: 200, },
        ),
      "/api/v1/character-growth/growth-log": () =>
        new Response(
          JSON.stringify({
            entries: [{ axis: "trait", eventType: "applied", reason: "Stood firm", recordedAt: "today", },],
          },),
          { status: 200, },
        ),
    };

    const journey = { innerHTML: "", };

    await loadCharacterJourney(modalWithJourney(journey,), "a1",);

    expect(calls.length,).toBe(2,);
    expect(journey.innerHTML,).toContain("crisis",);
    expect(journey.innerHTML,).toContain("The fall",);
    expect(journey.innerHTML,).toContain("Stood firm",);
    expect(journey.innerHTML,).toContain("character-journey",);
  });

  test("fetch failure shows the unavailable state", async () => {
    initJourney(async () => {
      throw new Error("net",);
    },);

    const journey = { innerHTML: "", };

    await loadCharacterJourney(modalWithJourney(journey,), "a1",);

    expect(journey.innerHTML,).toContain("Journey unavailable.",);
  });
});
