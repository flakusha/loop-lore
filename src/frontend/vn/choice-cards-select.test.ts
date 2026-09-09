// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for frontend/vn/choice-cards.ts selectChoice — selection requests and
 * state updates. Location/split/reunite effects live in
 * choice-cards-effects.test.ts. apiFetch/feFetch are mocked at the module seam
 * (chat-location.test.ts convention); DOM is a minimal fake sufficient for
 * renderChoiceCards.
 */
import { afterEach, describe, expect, mock, test, } from "bun:test";
import { destroyChoiceCards, getAccumulatedImpacts, initChoiceCards, loadChoices, selectChoice, } from "./choice-cards";

// ── Mock apiFetch / feFetch ─────────────────────────────────────────────────

let apiCalls: { url: string; opts: RequestInit }[] = [];
let apiHandler: ((url: string, opts: RequestInit,) => Response) | null = null;

mock.module("../alpine/htmx", () => ({
  apiFetch: async (url: string, opts?: RequestInit,) => {
    apiCalls.push({ url, opts: opts ?? {}, },);
    if (!apiHandler) { return new Response("{}", { status: 200, },); }
    return apiHandler(url, opts ?? {},);
  },
}),);
// choice-cards.ts imports feFetch directly (split/reunite); mock the seam so
// the real fe-fetch → utils barrel never loads in this suite.
mock.module("../fe-fetch", () => ({
  feFetch: async () => new Response("{}", { status: 200, },),
  getCsrfToken: () => "",
}),);

/** */
function jsonRes(body: unknown, status = 200,): Response {
  return Response.json(body, { status, },);
}

// ── Fake DOM (choice-cards-render.test.ts convention) ───────────────────────

interface FakeEl {
  className: string;
  disabled: boolean;
  children: FakeEl[];
  listeners: Record<string, Array<() => void>>;
  append(...els: FakeEl[]): void;
  replaceChildren(): void;
  addEventListener(type: string, fn: () => void,): void;
  setAttribute(name: string, value: string,): void;
}

/** */
function makeEl(): FakeEl {
  const el: FakeEl = {
    className: "",
    disabled: false,
    children: [],
    listeners: {},
    append(...els: FakeEl[]) {
      el.children.push(...els,);
    },
    replaceChildren() {
      el.children.length = 0;
    },
    addEventListener(type, fn,) {
      (el.listeners[type] ??= []).push(fn,);
    },
    setAttribute() {},
  };
  return el;
}

(globalThis as unknown as { document: unknown }).document = {
  createElement: () => makeEl(),
  // Superset of tests/setup-globals.ts: real modules (e.g. alpine/htmx.ts)
  // re-evaluate mid-process and touch these.
  addEventListener: () => {},
  dispatchEvent: () => true,
  querySelector: () => null,
};

// ── Fixtures ────────────────────────────────────────────────────────────────

const SEED = [
  {
    id: "c1",
    chat_id: "chat-1",
    scene_index: 2,
    choice_index: 0,
    text: "Go left",
    description: null,
    consequences: {},
    relationship_impact: {},
    mood_impact: {},
    unlock_conditions: {},
    selection_count: 0,
    is_active: 0,
  },
  {
    id: "c2",
    chat_id: "chat-1",
    scene_index: 2,
    choice_index: 1,
    text: "Stay",
    description: null,
    consequences: {},
    relationship_impact: {},
    mood_impact: {},
    unlock_conditions: {},
    selection_count: 0,
    is_active: 1,
  },
];

/** Boot with standard GET seed; returns the render container. */
async function boot(): Promise<FakeEl> {
  const container = makeEl();
  initChoiceCards(container as unknown as HTMLElement, "chat-1", 2,);
  apiHandler = (url,) => jsonRes(url.includes("/select",) ? {} : { choices: SEED, },);
  await loadChoices();
  return container;
}

afterEach(() => {
  apiHandler = null;
  apiCalls = [];
  destroyChoiceCards();
},);

// ── Tests ───────────────────────────────────────────────────────────────────

describe("selectChoice", () => {
  test("returns null before init or for an unknown choice id", async () => {
    expect(await selectChoice("c1",),).toBeNull();
    expect(apiCalls.length,).toBe(0,);
    await boot();
    expect(await selectChoice("nope",),).toBeNull();
    expect(apiCalls.length,).toBe(1,); // only the seed GET
  });

  test("POSTs the select endpoint and marks the choice selected", async () => {
    await boot();
    apiHandler = (url,) =>
      jsonRes(
        url.includes("/select",)
          ? { choice: { choice: { ...SEED[0], relationship_impact: { rival: 1, }, }, }, }
          : { choices: SEED, },
      );
    const result = await selectChoice("c1",);
    expect(result,).toEqual({
      choice: { ...SEED[0]!, relationship_impact: { rival: 1, }, },
      locationId: undefined,
      splitTriggered: false,
      reunionTriggered: false,
      locationChanged: false,
    },);
    const call = apiCalls.find((c,) => c.url.endsWith("/select",))!;
    expect(call.url,).toBe("/api/v1/chats/chat-1/vn-choices/c1/select",);
    expect(call.opts.method,).toBe("POST",);
    expect((call.opts.headers as Record<string, string>)["Content-Type"],).toBe("application/json",);
    expect(JSON.parse(String(call.opts.body,),),).toEqual({ choiceId: "c1", },);
    // The selected flag makes the returned impacts observable downstream.
    expect(getAccumulatedImpacts(),).toEqual({ relationships: { rival: 1, }, moods: {}, },);
  });

  test("accepts the {data: {choice}} response shape", async () => {
    await boot();
    apiHandler = (url,) =>
      jsonRes(
        url.includes("/select",)
          ? { data: { choice: SEED[0], }, }
          : { choices: SEED, },
      );
    expect((await selectChoice("c1",))?.choice.id,).toBe("c1",);
  });

  test("returns null on non-ok or thrown select requests, keeping state", async () => {
    await boot();
    apiHandler = (url,) => jsonRes(url.includes("/select",) ? { error: "no", } : { choices: SEED, }, 500,);
    expect(await selectChoice("c1",),).toBeNull();
    expect(getAccumulatedImpacts(),).toEqual({ relationships: {}, moods: {}, },);
    apiHandler = (url,) => {
      if (url.includes("/select",)) { throw new Error("boom",); }
      return jsonRes({ choices: SEED, },);
    };
    expect(await selectChoice("c1",),).toBeNull();
  });

  test("clicking an available rendered card runs selectChoice end-to-end", async () => {
    const container = await boot();
    apiHandler = (url,) =>
      jsonRes(
        url.includes("/select",)
          ? { choice: { choice: SEED[0], }, }
          : { choices: SEED, },
      );
    const card = container.children[0]!.children[0]!;
    card.listeners["click"]![0]!();
    // The mocked apiFetch records the POST synchronously when invoked.
    expect(apiCalls.some((c,) => c.url.endsWith("/c1/select",)),).toBe(true,);
  });
});
