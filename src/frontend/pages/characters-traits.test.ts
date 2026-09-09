// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Behavioral tests for the internal-traits page logic. The fake DOM honors the
 * browser's textContent → getHTML() escaping contract, so the regression
 * TASK-character-traits-page-injects-unescaped-goal-into-innerhtml is verified
 * behaviorally: a hostile goal must come out escaped in the rendered HTML.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { initTraits, renderAspirations, updateSliderDisplays, } from "./characters-traits";

type Listener = (e: unknown,) => void;

interface FakeEl {
  id: string;
  value: string;
  type?: string;
  textContent: string;
  innerHTML: string;
  style: Record<string, string>;
  getHTML(): string;
}

interface FakeDocument {
  listeners: Map<string, Listener[]>;
  register(el: FakeEl,): FakeEl;
  querySelector(sel: string,): FakeEl | null;
  createElement(tag: string,): FakeEl;
  addEventListener(type: string, fn: Listener,): void;
}

function makeDocument(): FakeDocument {
  const byId = new Map<string, FakeEl>();
  const listeners = new Map<string, Listener[]>();
  const d: FakeDocument = {
    listeners,
    register: (el,) => {
      byId.set(el.id, el,);
      return el;
    },
    querySelector: (sel,) => sel.startsWith("#",) ? byId.get(sel.slice(1,),) ?? null : null,
    createElement: (_tag,) => makeEl(),
    addEventListener: (type, fn,) => {
      const arr = listeners.get(type,) ?? [];
      arr.push(fn,);
      listeners.set(type, arr,);
    },
  };
  return d;
}

function makeEl(id = "",): FakeEl {
  return {
    id,
    value: "",
    textContent: "",
    innerHTML: "",
    style: {},
    getHTML(): string {
      // Mirrors the browser: serializing element content escapes & < >.
      return this.textContent.replaceAll("&", "&amp;",).replaceAll("<", "&lt;",).replaceAll(">", "&gt;",);
    },
  };
}

/** The page logic exposes its handlers as globals; named view over them. */
const page = globalThis as unknown as {
  addAspiration: () => void;
  removeAspiration: (idx: number,) => void;
  loadInternalTraits: (actorId: string,) => Promise<void>;
  saveInternalTraits: (actorId: string,) => Promise<void>;
};

const originalDocument = globalThis.document;
let doc: FakeDocument;

beforeEach(() => {
  doc = makeDocument();
  globalThis.document = doc as unknown as Document;
},);

afterEach(() => {
  globalThis.document = originalDocument;
  // aspirationsData is module-private: remove entries until the empty state.
  for (let i = 0; i < 50; i++) { page.removeAspiration(0,); }
},);

/** Register every input the traits form logic touches (inputs + displays). */
function registerForm(): void {
  const sliders = "moral-lawful moral-good auto-group auto-solo approach-risk approach-initiative voice-emotional"
    .split(" ",);
  const texts =
    "cope-stress cope-failure cope-conflict approach-decision voice-tics voice-vocab voice-structure voice-humor"
      .split(" ",);
  for (const id of [...sliders, ...texts,]) { doc.register(makeEl(id,),); }
  for (const id of sliders) { doc.register(makeEl(`${id}-val`,),); }
}

describe("initTraits", () => {
  test("wires an input listener that mirrors range values into -val displays", () => {
    initTraits(async () => new Response("{}",));
    const input = doc.register({ ...makeEl("moral-lawful",), type: "range", value: "12", },);
    const display = doc.register(makeEl("moral-lawful-val",),);
    const [handler,] = doc.listeners.get("input",) ?? [];
    expect(handler,).toBeDefined();
    handler?.({ target: input, },);
    expect(display.textContent,).toBe("12",);
    handler?.({ target: { ...input, type: "text", }, },); // non-range ignored
    expect(display.textContent,).toBe("12",);
  });
});

describe("aspirations", () => {
  test("addAspiration appends a default row with index-bound handlers", () => {
    const list = doc.register(makeEl("aspirations-list",),);
    page.addAspiration();
    page.addAspiration();
    expect(list.innerHTML,).toContain('onchange="aspirationsData[0].goal=this.value"',);
    expect(list.innerHTML,).toContain('onclick="removeAspiration(1)"',);
    expect(list.innerHTML,).toContain(`<option value="medium" selected>`,);
    expect(list.innerHTML,).toContain(`<option value="hidden" selected>`,);
  });

  test("renderAspirations: empty state with rows; no-op without a container", () => {
    const list = doc.register(makeEl("aspirations-list",),);
    renderAspirations();
    expect(list.innerHTML,).toContain("No aspirations defined yet.",);
    const emptyDoc = makeDocument();
    globalThis.document = emptyDoc as unknown as Document;
    expect(() => page.addAspiration()).not.toThrow();
    expect(emptyDoc.querySelector("#aspirations-list",),).toBeNull();
  });
});

describe("updateSliderDisplays", () => {
  test("copies each registered slider input value into its display", () => {
    doc.register({ ...makeEl("moral-lawful",), value: "-37.5", },);
    const display = doc.register(makeEl("moral-lawful-val",),);
    doc.register(makeEl("voice-emotional",),); // input without matching display
    expect(() => updateSliderDisplays()).not.toThrow();
    expect(display.textContent,).toBe("-37.5",);
  });
});

const fullTraits = {
  aspirations: [
    { id: "a1", goal: `<script>alert(1)</script>`, plans: [], visibility: "hinted", priority: "high", progress: 40, },
  ],
  moralDisposition: { lawful_chaotic: -0.5, good_evil: 0.25, },
  autonomyPreferences: { group_comfort: 0.8, },
  copingMechanisms: { stress_response: "breathe", conflict_style: "mediate", },
  approachTendencies: { decision_style: "deliberate", risk_tolerance: 0.9, },
  voicePatterns: { verbal_tics: ["hmm", "well",], vocabulary_level: "plain", humor_style: "dry", },
};

describe("loadInternalTraits", () => {
  test("hydrates sliders, text fields, displays, and aspirations from the API", async () => {
    const urls: string[] = [];
    initTraits((url,) => {
      urls.push(url,);
      return Promise.resolve(new Response(JSON.stringify(fullTraits,),),);
    },);
    registerForm();
    const list = doc.register(makeEl("aspirations-list",),);

    await page.loadInternalTraits("a1",);

    expect(urls,).toEqual(["/api/character-internal-traits?actorId=a1",],);
    expect(doc.querySelector("#moral-lawful",)?.value,).toBe("-0.5",);
    expect(doc.querySelector("#moral-lawful-val",)?.textContent,).toBe("-0.5",);
    expect(doc.querySelector("#auto-solo-val",)?.textContent,).toBe("0.5",); // default when omitted
    expect(doc.querySelector("#cope-stress",)?.value,).toBe("breathe",);
    expect(doc.querySelector("#voice-tics",)?.value,).toBe("hmm, well",);
    expect(doc.querySelector("#approach-decision",)?.value,).toBe("deliberate",);
    // The hostile goal must be escaped, never interpolated raw.
    expect(list.innerHTML,).toContain("&lt;script&gt;alert(1)&lt;/script&gt;",);
    expect(list.innerHTML,).not.toContain("<script>",);
  });

  test("leaves the form untouched on non-ok responses and network failures", async () => {
    initTraits(async () => new Response("denied", { status: 403, },));
    const lawful = doc.register(makeEl("moral-lawful",),);
    await page.loadInternalTraits("a1",);
    expect(lawful.value,).toBe("",);
    initTraits(async () => {
      throw new Error("boom",);
    },);
    await expect(page.loadInternalTraits("a1",),).resolves.toBeUndefined();
    expect(lawful.value,).toBe("",);
  });
});

describe("saveInternalTraits", () => {
  async function hydrate(): Promise<void> {
    registerForm();
    doc.register(makeEl("aspirations-list",),);
    initTraits(async () => new Response(JSON.stringify(fullTraits,),));
    await page.loadInternalTraits("a1",);
  }

  test("PUTs a payload built from the form and reports success", async () => {
    await hydrate();
    const calls: { url: string; init: RequestInit }[] = [];
    const status = doc.register(makeEl("traits-status",),);
    doc.querySelector("#voice-tics",)!.value = "hmm,  well , ,";
    doc.querySelector("#cope-failure",)!.value = ""; // empty optional → undefined
    initTraits((url, init,) => {
      calls.push({ url, init: init ?? {}, },);
      return Promise.resolve(new Response("{}",),);
    },);
    await page.saveInternalTraits("a1",);

    expect(calls.length,).toBe(1,);
    expect(calls[0]!.url,).toBe("/api/character-internal-traits?actorId=a1",);
    expect(calls[0]!.init.method,).toBe("PUT",);
    const payload = JSON.parse(String(calls[0]!.init.body,),) as {
      aspirations: { goal: string; progress: number }[];
      copingMechanisms: { failure_response?: string };
      voicePatterns: { verbal_tics: string[] };
    };
    expect(payload.aspirations.length,).toBe(1,); // only non-empty goals survive
    expect(payload.aspirations[0]!.goal,).toBe(`<script>alert(1)</script>`,);
    expect(payload.aspirations[0]!.progress,).toBe(40,);
    expect(payload.copingMechanisms.failure_response,).toBeUndefined();
    expect(payload.voicePatterns.verbal_tics,).toEqual(["hmm", "well",],);
    expect(status.textContent,).toBe("✓ Internal traits saved",);
    expect(status.style.color,).toBe("var(--color-success)",);
  });

  test("reports failure on non-ok responses, throws, and missing status el", async () => {
    await hydrate();
    const status = doc.register(makeEl("traits-status",),);
    initTraits(async () => new Response("no", { status: 500, },));
    await page.saveInternalTraits("a1",);
    expect(status.textContent,).toBe("✗ Failed to save traits",);
    expect(status.style.color,).toBe("var(--color-error)",);
    initTraits(async () => {
      throw new Error("offline",);
    },);
    status.textContent = "";
    await page.saveInternalTraits("a1",);
    expect(status.textContent,).toBe("✗ Failed to save traits",);
    // Missing status element must not throw either.
    globalThis.document = makeDocument() as unknown as Document;
    initTraits(async () => new Response("{}",));
    await expect(page.saveInternalTraits("a1",),).resolves.toBeUndefined();
  });
});
