// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for frontend/vn/choice-cards.ts selectChoice effects — location change
 * dispatch and split/reunite consequences (mock-module seam convention).
 */
import { afterEach, describe, expect, mock, test, } from "bun:test";
import { destroyChoiceCards, initChoiceCards, loadChoices, selectChoice, } from "./choice-cards";

// ── Mock apiFetch / feFetch ─────────────────────────────────────────────────

let apiHandler: ((url: string, opts: RequestInit,) => Response) | null = null;
let feCalls: { url: string; opts: RequestInit }[] = [];
let feHandler: ((url: string, opts: RequestInit,) => Response) | null = null;

mock.module("../alpine/htmx", () => ({
  apiFetch: async (url: string, opts?: RequestInit,) => {
    if (!apiHandler) { return new Response("{}", { status: 200, },); }
    return apiHandler(url, opts ?? {},);
  },
}),);
mock.module("../fe-fetch", () => ({
  feFetch: async (url: string, opts?: RequestInit,) => {
    feCalls.push({ url, opts: opts ?? {}, },);
    if (!feHandler) { return new Response("{}", { status: 200, },); }
    return feHandler(url, opts ?? {},);
  },
  getCsrfToken: () => "",
}),);

/** */
function jsonRes(body: unknown, status = 200,): Response {
  return Response.json(body, { status, },);
}

// Capture chat:location-changed dispatches (globalThis.dispatchEvent stub).
const windowEvents: Event[] = [];
(globalThis as unknown as { dispatchEvent: (e: Event,) => boolean }).dispatchEvent = (e: Event,) => {
  windowEvents.push(e,);
  return true;
};

// ── Fake DOM ────────────────────────────────────────────────────────────────
// Minimal DOM objects: renderChoiceCards only assigns fields and calls
// append/replaceChildren/addEventListener/setAttribute; none of that is
// asserted here.

/** */
function fakeEl(): HTMLElement {
  return {
    append: () => {},
    addEventListener: () => {},
    replaceChildren: () => {},
    setAttribute: () => {},
  } as unknown as HTMLElement;
}

(globalThis as unknown as { document: unknown }).document = {
  createElement: () => fakeEl(),
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

/** Boot with standard GET seed; tests then override `apiHandler` per case. */
async function boot(): Promise<void> {
  initChoiceCards(fakeEl(), "chat-1", 2,);
  apiHandler = (url,) => jsonRes(url.includes("/select",) ? {} : { choices: SEED, },);
  await loadChoices();
}

afterEach(() => {
  apiHandler = null;
  feHandler = null;
  feCalls = [];
  windowEvents.length = 0;
  destroyChoiceCards();
},);

// ── Tests ───────────────────────────────────────────────────────────────────

describe("selectChoice effects", () => {
  test("location change PUT dispatches chat:location-changed on success", async () => {
    await boot();
    apiHandler = (url,) =>
      jsonRes(
        url.includes("/select",) ? { choice: { choice: SEED[0], locationId: "loc-9", }, } : { choices: SEED, },
      );
    const result = await selectChoice("c1",);
    expect(result?.locationChanged,).toBe(true,);
    expect(result?.locationId,).toBe("loc-9",);
    expect(windowEvents.length,).toBe(1,);
    expect((windowEvents[0] as CustomEvent).type,).toBe("chat:location-changed",);
    expect((windowEvents[0] as CustomEvent).detail,).toEqual(
      { chatId: "chat-1", locationId: "loc-9", locationName: null, },
    );
  });

  test("location change failure is best-effort: no event, result still returned", async () => {
    await boot();
    const selectPayload = { choice: { choice: SEED[0], locationId: "loc-9", }, };
    apiHandler = (url,) =>
      jsonRes(url.includes("/select",) ? selectPayload : { choices: SEED, }, url.includes("/location",) ? 500 : 200,);
    let result = await selectChoice("c1",);
    expect(result?.locationChanged,).toBe(false,);
    expect(result?.choice.id,).toBe("c1",);
    expect(windowEvents.length,).toBe(0,);

    // A thrown PUT is swallowed the same way.
    apiHandler = (url,) => {
      if (url.includes("/location",)) { throw new Error("put",); }
      return jsonRes(url.includes("/select",) ? selectPayload : { choices: SEED, },);
    };
    result = await selectChoice("c1",);
    expect(result?.locationChanged,).toBe(false,);
  });

  test("split consequence with two valid branches POSTs the split endpoint", async () => {
    await boot();
    const branches = [{ locationId: "loc-a", actorIds: ["x",], }, { locationId: "loc-b", actorIds: ["y", "z",], },];
    apiHandler = () =>
      jsonRes({ choice: { choice: { ...SEED[0], consequences: { action: "split", branches, }, }, }, },);
    const result = await selectChoice("c1",);
    expect(result?.splitTriggered,).toBe(true,);
    expect(feCalls.length,).toBe(1,);
    expect(feCalls[0]!.url,).toBe("/api/chats/chat-1/split",);
    expect(feCalls[0]!.opts.method,).toBe("POST",);
    expect(JSON.parse(String(feCalls[0]!.opts.body,),),).toEqual({ branches, },);
  });

  test("filters invalid branches and skips split without two valid ones", async () => {
    await boot();
    apiHandler = () =>
      jsonRes({
        choice: {
          choice: {
            ...SEED[0],
            consequences: {
              action: "split",
              branches: [
                null,
                "junk",
                { locationId: "loc-a", actorIds: ["x",], },
                { locationId: 7, actorIds: ["q",], },
                { locationId: "loc-b", actorIds: [1, "z", {},], },
                { locationId: "loc-c", actorIds: [], },
              ],
            },
          },
        },
      },);
    const result = await selectChoice("c1",);
    expect(result?.splitTriggered,).toBe(true,);
    expect(JSON.parse(String(feCalls[0]!.opts.body,),),).toEqual({
      branches: [{ locationId: "loc-a", actorIds: ["x",], }, { locationId: "loc-b", actorIds: ["z",], },],
    },);

    // Only one valid branch → no split call at all.
    apiHandler = () =>
      jsonRes({
        choice: {
          choice: {
            ...SEED[0],
            consequences: { action: "split", branches: [{ locationId: "loc-a", actorIds: ["x",], },], },
          },
        },
      },);
    feCalls = [];
    const single = await selectChoice("c1",);
    expect(single?.splitTriggered,).toBe(false,);
    expect(feCalls.length,).toBe(0,);
  });

  test("split endpoint failure or throw reports splitTriggered=false", async () => {
    await boot();
    const consequence = {
      action: "split",
      branches: [{ locationId: "a", actorIds: ["x",], }, { locationId: "b", actorIds: ["y",], },],
    };
    apiHandler = () => jsonRes({ choice: { choice: { ...SEED[0], consequences: consequence, }, }, },);
    feHandler = () => jsonRes({ error: "no", }, 500,);
    expect((await selectChoice("c1",))?.splitTriggered,).toBe(false,);
    feHandler = () => {
      throw new Error("boom",);
    };
    expect((await selectChoice("c1",))?.splitTriggered,).toBe(false,);
  });

  test("reunite consequence POSTs secondaryChatId; non-string source is ignored", async () => {
    await boot();
    apiHandler = () =>
      jsonRes({
        choice: { choice: { ...SEED[0], consequences: { action: "reunite", secondaryChatId: "chat-2", }, }, },
      },);
    const result = await selectChoice("c1",);
    expect(result?.reunionTriggered,).toBe(true,);
    expect(feCalls[0]!.url,).toBe("/api/chats/chat-1/reunite",);
    expect(JSON.parse(String(feCalls[0]!.opts.body,),),).toEqual({ secondaryChatId: "chat-2", },);
    feHandler = () => {
      throw new Error("boom",);
    };
    expect((await selectChoice("c1",))?.reunionTriggered,).toBe(false,);

    // Reunion failure modes: non-ok endpoint, thrown fetch, non-string source.
    feHandler = () => jsonRes({}, 500,);
    expect((await selectChoice("c1",))?.reunionTriggered,).toBe(false,);
    apiHandler = () =>
      jsonRes({ choice: { choice: { ...SEED[0], consequences: { action: "reunite", secondaryChatId: 42, }, }, }, },);
    feCalls = [];
    expect((await selectChoice("c1",))?.reunionTriggered,).toBe(false,);
    expect(feCalls.length,).toBe(0,);
  });
});
