// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for frontend/vn/choice-cards.ts — init/destroy lifecycle, loadChoices
 * state derivation, and accumulated impacts. apiFetch is mocked at the module
 * seam (chat-location.test.ts convention); DOM is a minimal fake sufficient
 * for renderChoiceCards.
 */
import { afterAll, afterEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import {
  destroyChoiceCards,
  getAccumulatedImpacts,
  initChoiceCards,
  loadChoices,
  skipChoice,
  submitCustomChoice,
} from "./choice-cards";
import { isVnDecisionPending, setChoicePending, setQuestionPending, } from "./pending-decision";

// ── Mock apiFetch ───────────────────────────────────────────────────────────

let apiCalls: { url: string; opts: RequestInit }[] = [];
let apiHandler: ((url: string, opts: RequestInit,) => Response) | null = null;

if (ISOLATED) {
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
}

/** */
function jsonRes(body: unknown, status = 200,): Response {
  return Response.json(body, { status, },);
}

// ── Fake DOM (choice-cards-render.test.ts convention) ───────────────────────

interface FakeEl {
  className: string;
  disabled: boolean;
  textContent: string;
  value: string;
  attrs: Record<string, string>;
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
    textContent: "",
    value: "",
    attrs: {},
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
    setAttribute(name, value,) {
      el.attrs[name] = value;
    },
  };

  return el;
}

// Module-scope global write must be handed back in afterAll — later files in
// the shared bun:test process need the load-time DOM surface.
const originalDocument = (globalThis as { document?: unknown }).document;
// Captured so the failed-skip toast can be asserted; the card modules report a
// rejected skip through the same global `show-toast` channel context-window.ts
// already uses.
const toasts: { type: string; message: string }[] = [];
(globalThis as unknown as { document: unknown }).document = {
  createElement: () => makeEl(),
  // Superset of tests/setup-globals.ts: real modules (e.g. alpine/htmx.ts)
  // re-evaluate mid-process and touch these.
  addEventListener: () => {},
  dispatchEvent: (e: Event,) => {
    if (e.type === "show-toast") {
      const detail = (e as CustomEvent<{ type: string; message: string }>).detail;
      toasts.push({ type: detail?.type, message: detail?.message, },);
    }

    return true;
  },
  querySelector: () => null,
};

afterAll(() => {
  (globalThis as unknown as { document: unknown }).document = originalDocument;
},);

// ── Fixtures ────────────────────────────────────────────────────────────────

/** Raw API row with defaults; overrides win. */
function rawChoice(overrides: Record<string, unknown> = {},): Record<string, unknown> {
  return {
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
    ...overrides,
  };
}

/** Init with a fresh fake container; returns it for render assertions. */
function boot(): FakeEl {
  const container = makeEl();
  initChoiceCards(container as unknown as HTMLElement, "chat-1", 2,);
  return container;
}

/** Labels of each card, via the label span (choice-cards-render.test.ts convention). */
function cardLabels(cards: FakeEl[],): string[] {
  return cards.map((c,) => c.children[0]?.textContent ?? "");
}

afterEach(() => {
  apiHandler = null;
  apiCalls = [];
  destroyChoiceCards();
},);

// ── Tests ───────────────────────────────────────────────────────────────────

describeOrSkip("initChoiceCards / destroyChoiceCards", () => {
  test("loadChoices before init never fetches", async () => {
    await loadChoices();
    expect(apiCalls.length,).toBe(0,);
  });

  test("destroy clears state and subsequent loadChoices is a no-op", async () => {
    const container = boot();
    apiHandler = () => jsonRes({ choices: [rawChoice({ is_active: 1, relationship_impact: { alice: 1, }, },),], },);
    await loadChoices();
    destroyChoiceCards();
    expect(getAccumulatedImpacts(),).toEqual({ relationships: {}, moods: {}, },);
    const callsBefore = apiCalls.length;
    await loadChoices();
    expect(apiCalls.length,).toBe(callsBefore,);
    expect(container.children.length,).toBe(1,); // untouched by the no-op load
  });
},);

describeOrSkip("loadChoices", () => {
  test("fetches scene choices, derives selected/label, and renders", async () => {
    const container = boot();
    apiHandler = () =>
      jsonRes({
        choices: [
          rawChoice({
            id: "sel",
            is_active: 1,
            text: "Open the door",
            relationship_impact: { alice: 2, bob: -1, },
            mood_impact: { tense: 1, },
          },),
          rawChoice({
            id: "lb",
            label: "Custom label",
            description: "A narrow path",
            relationship_impact: { alice: 5, },
          },),
          rawChoice({ id: "anon", text: undefined, },),
        ],
      },);

    await loadChoices();
    expect(apiCalls.length,).toBe(1,);
    expect(apiCalls[0]!.url,).toBe("/api/v1/chats/chat-1/vn-choices?sceneIndex=2",);

    // Unselected impact (alice:5 on "lb") is skipped; selected ones accumulate.
    expect(getAccumulatedImpacts(),).toEqual({
      relationships: { alice: 2, bob: -1, },
      moods: { tense: 1, },
    },);

    // Available cards first (in order), selected card last.
    const cards = container.children[0]!.children;
    expect(cards.map((c,) => c.children[0]?.textContent ?? ""),)
      .toEqual(["Custom label", "Untitled choice", "Open the door",],);

    expect(cards[0]!.children[1]?.textContent,).toBe("A narrow path",);
    const selectedCard = cards[2]!;
    expect(selectedCard.className,).toBe("vn-choice-card vn-choice-card--selected",);
    expect(selectedCard.disabled,).toBe(true,);
    expect(selectedCard.attrs["aria-selected"],).toBe("true",);
  });

  test("accepts the {data: [...]} response shape", async () => {
    boot();
    apiHandler = () =>
      jsonRes({ data: [rawChoice({ id: "d1", is_active: 1, relationship_impact: { kim: 1, }, },),], },);

    await loadChoices();
    expect(getAccumulatedImpacts(),).toEqual({ relationships: { kim: 1, }, moods: {}, },);
  });

  test("empty payload clears previous choices", async () => {
    boot();
    apiHandler = () => jsonRes({ choices: [rawChoice({ is_active: 1, relationship_impact: { alice: 1, }, },),], },);
    await loadChoices();
    apiHandler = () => jsonRes({},);
    await loadChoices();
    expect(getAccumulatedImpacts(),).toEqual({ relationships: {}, moods: {}, },);
  });

  test("non-ok response keeps previous state", async () => {
    boot();
    apiHandler = () => jsonRes({ choices: [rawChoice({ is_active: 1, relationship_impact: { alice: 1, }, },),], },);
    await loadChoices();
    apiHandler = () => jsonRes({ error: "boom", }, 500,);
    await loadChoices();
    expect(getAccumulatedImpacts(),).toEqual({ relationships: { alice: 1, }, moods: {}, },);
  });

  test("network error clears choices instead of throwing", async () => {
    boot();
    apiHandler = () => jsonRes({ choices: [rawChoice({ is_active: 1, relationship_impact: { alice: 1, }, },),], },);
    await loadChoices();
    apiHandler = () => {
      throw new Error("network",);
    };

    await loadChoices();
    expect(getAccumulatedImpacts(),).toEqual({ relationships: {}, moods: {}, },);
  });

  test("loadChoices raises the pending flag", async () => {
    boot();
    apiHandler = () => jsonRes({ choices: [rawChoice({},),], },);
    await loadChoices();
    expect(isVnDecisionPending(),).toBe(true,);
  });

  test("destroyChoiceCards clears the pending flag", async () => {
    boot();
    apiHandler = () => jsonRes({ choices: [rawChoice({},),], },);
    await loadChoices();
    destroyChoiceCards();

    // Otherwise the composer stays blocked on a decision whose cards are gone.
    expect(isVnDecisionPending(),).toBe(false,);
  });

  test("skipChoice posts the dismiss endpoint and clears the flag", async () => {
    boot();
    apiHandler = () => jsonRes({ choices: [rawChoice({},),], },);
    await loadChoices();
    apiHandler = () => jsonRes({ dismissed: "c1", },);

    expect(await skipChoice("c1",),).toBe(true,);
    const call = apiCalls.find((c,) => c.url.includes("/dismiss",));
    expect(call?.opts.method,).toBe("POST",);
    expect(isVnDecisionPending(),).toBe(false,);
  });

  test("a failed skip keeps the flag set so the chat is never silently wedged open", async () => {
    boot();
    apiHandler = () => jsonRes({ choices: [rawChoice({},),], },);
    await loadChoices();
    apiHandler = () => jsonRes({ error: "boom", }, 500,);

    expect(await skipChoice("c1",),).toBe(false,);
    expect(isVnDecisionPending(),).toBe(true,);
  });

  test("a failed skip surfaces a toast instead of failing silently", async () => {
    boot();
    apiHandler = () => jsonRes({ choices: [rawChoice({},),], },);
    await loadChoices();
    toasts.length = 0;
    apiHandler = () => jsonRes({ error: "not found", }, 404,);

    expect(await skipChoice("c1",),).toBe(false,);

    // A 404 leaves the row `available` server-side, so the gate keeps 409ing.
    // Without feedback the only recovery is a reload, which reads as "broken".
    expect(toasts.length,).toBe(1,);
    expect(toasts[0]!.type,).toBe("error",);
  });

  test("a successful skip raises no toast", async () => {
    boot();
    apiHandler = () => jsonRes({ choices: [rawChoice({},),], },);
    await loadChoices();
    toasts.length = 0;
    apiHandler = () => jsonRes({ dismissed: "c1", },);

    expect(await skipChoice("c1",),).toBe(true,);
    expect(toasts.length,).toBe(0,);
  });

  // The two card modules load fire-and-forget from render-scene.ts, so with a
  // single shared boolean the last writer wins and one source's pending state
  // silently vanishes. Each owns a slot; the reader ORs them.
  test("a pending question survives an empty choice load (per-source tracking)", async () => {
    boot();
    setQuestionPending(true,);

    // The choice load resolves LAST and finds nothing — the exact ordering
    // that used to clobber the question's flag.
    apiHandler = () => jsonRes({ choices: [], },);
    await loadChoices();

    expect(isVnDecisionPending(),).toBe(true,);
    setQuestionPending(false,);
  });

  test("a pending choice survives when no question is pending", async () => {
    boot();
    setQuestionPending(false,);
    apiHandler = () => jsonRes({ choices: [rawChoice({},),], },);
    await loadChoices();

    expect(isVnDecisionPending(),).toBe(true,);
  });
},);

describeOrSkip("submitCustomChoice", () => {
  test("posts { freeText, sceneIndex } and folds the returned card in as selected", async () => {
    const container = boot();
    apiHandler = (url,) => {
      if (url.includes("/custom",)) {
        return jsonRes({
          choice: rawChoice({
            id: "custom-abc",
            text: "I bolt the door",
            label: "I bolt the door",
            consequences: { provenance: "custom", },
          },),
          locationId: null,
          appliedAt: null,
        },);
      }

      return jsonRes({ choices: [rawChoice({},),], },);
    };

    await loadChoices();
    toasts.length = 0;

    expect(await submitCustomChoice("  I bolt the door  ",),).toBe(true,);

    const call = apiCalls.find((c,) => c.url.includes("/custom",));
    expect(call?.url,).toBe("/api/v1/chats/chat-1/vn-choices/custom",);
    expect(call?.opts.method,).toBe("POST",);
    expect(JSON.parse(call!.opts.body as string,),).toEqual({
      freeText: "  I bolt the door  ",
      sceneIndex: 2,
    },);

    // The typed card is selected locally; the seeded generated card is not,
    // so the gate stays closed (same rule as a card pick).
    expect(isVnDecisionPending(),).toBe(true,);
    expect(getAccumulatedImpacts(),).toEqual({ relationships: {}, moods: {}, },);

    // Re-render includes both cards: available generated card first, then the
    // selected custom card (both carry the vn-choice-card base class).
    const cards = container.children[0]!.children.filter((c,) => c.className.includes("vn-choice-card",));
    expect(cardLabels(cards,),).toEqual(["Go left", "I bolt the door",],);
    expect(cards[1]!.className,).toBe("vn-choice-card vn-choice-card--selected",);
    setChoicePending(false,);
  });

  test("a rejected custom action surfaces a toast and changes nothing", async () => {
    boot();
    apiHandler = () => jsonRes({ choices: [rawChoice({},),], },);
    await loadChoices();
    toasts.length = 0;
    apiHandler = () => jsonRes({ error: "blank", }, 400,);

    expect(await submitCustomChoice("   ",),).toBe(false,);
    expect(toasts.length,).toBe(1,);
    expect(toasts[0]!.type,).toBe("error",);
  });
},);
