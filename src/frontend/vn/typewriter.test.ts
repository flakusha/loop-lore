// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for frontend/vn/typewriter.ts — character-by-character text reveal.
 *
 * matchMedia + requestAnimationFrame are stubbed so animation frames advance
 * deterministically. bun:test has no fake-timer API, so completion is awaited
 * via the promises the code already exposes instead of wall-clock sleeps; the
 * only timer waits are zero-delay scheduler-boundary flushes.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { VnScene, } from "./scene-renderer/types";
import { getDialogueTemplate, getSceneTemplate, } from "./templates/scene-templates";
import { isTypewriting, resolveDialoguePacing, skipTypewrite, typewrite, } from "./typewriter";

// ── Global stubs ────────────────────────────────────────────────────────────

type Globals = Record<string, unknown>;
const originalMatchMedia = (globalThis as Globals).matchMedia;
const originalRaf = (globalThis as Globals).requestAnimationFrame;
const originalCancelRaf = (globalThis as Globals).cancelAnimationFrame;

let reducedMotion = false;
const pendingFrames = new Map<number, () => void>();
let nextFrameId = 0;
const testStorage = new Map<string, string>();
const originalStorage = (globalThis as Globals).localStorage;

/** Flush pending macrotasks once: lets stubbed animation frames settle. */
function tick(): Promise<void> {
  const { promise, resolve, } = Promise.withResolvers<void>();
  setTimeout(resolve, 0,);
  return promise;
}

beforeEach(() => {
  reducedMotion = false;
  pendingFrames.clear();
  // bun:test has no DOM storage; the custom-template store needs a stub.
  (globalThis as Globals).localStorage = {
    getItem: (key: string,) => testStorage.get(key,) ?? null,
    setItem: (key: string, value: string,) => void testStorage.set(key, String(value,),),
    removeItem: (key: string,) => void testStorage.delete(key,),
  };

  (globalThis as Globals).matchMedia = (query: string,): { matches: boolean } => ({
    matches: reducedMotion && query.includes("reduce",),
  });

  (globalThis as Globals).requestAnimationFrame = (cb: () => void,): number => {
    const id = ++nextFrameId;
    pendingFrames.set(id, cb,);
    setTimeout(() => {
      const frame = pendingFrames.get(id,);
      pendingFrames.delete(id,);
      frame?.();
    }, 0,);

    return id;
  };

  (globalThis as Globals).cancelAnimationFrame = (handle: number,): void => {
    pendingFrames.delete(handle,);
  };
},);

afterEach(() => {
  (globalThis as Globals).matchMedia = originalMatchMedia;
  (globalThis as Globals).requestAnimationFrame = originalRaf;
  (globalThis as Globals).cancelAnimationFrame = originalCancelRaf;
  (globalThis as Globals).localStorage = originalStorage;
  testStorage.clear();
},);

// ── Fake element ────────────────────────────────────────────────────────────

function makeEl(): HTMLElement {
  return { textContent: "", } as unknown as HTMLElement;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("typewrite", () => {
  test("reveals every character in order and reports progress", async () => {
    const el = makeEl();
    const seen: Array<[string, number,]> = [];

    await typewrite(el, "Hi!", {
      speed: 0,
      pausePunctuation: false,
      onChar: (char, index,) => void seen.push([char, index,],),
    },);

    expect(el.textContent,).toBe("Hi!",);
    expect(seen,).toEqual([["H", 0,], ["i", 1,], ["!", 2,],],);
  });

  test("empty text resolves without calling onChar", async () => {
    const el = makeEl();
    let chars = 0;
    let completed = 0;

    await typewrite(el, "", {
      speed: 0,
      pausePunctuation: false,
      onChar: () => void chars++,
      onComplete: () => void completed++,
    },);

    expect(el.textContent,).toBe("",);
    expect(chars,).toBe(0,);
    expect(completed,).toBe(1,);
  });

  test("prefers-reduced-motion reveals instantly without animating", async () => {
    reducedMotion = true;
    const el = makeEl();
    let chars = 0;
    let completed = 0;

    await typewrite(el, "instant", {
      speed: 1000,
      pausePunctuation: false,
      onChar: () => void chars++,
      onComplete: () => void completed++,
    },);

    expect(el.textContent,).toBe("instant",);
    expect(chars,).toBe(0,);
    expect(completed,).toBe(1,);
    expect(isTypewriting(),).toBe(false,);
  });

  test("isTypewriting is true only while the animation runs", async () => {
    const el = makeEl();
    expect(isTypewriting(),).toBe(false,);

    // First character is revealed synchronously; the rest wait on frames.
    const pending = typewrite(el, "abc", { speed: 40, pausePunctuation: false, },);
    expect(el.textContent,).toBe("a",);
    expect(isTypewriting(),).toBe(true,);

    await pending;
    expect(isTypewriting(),).toBe(false,);
    expect(el.textContent,).toBe("abc",);
  });
});

describe("skipTypewrite", () => {
  test("fills the full text, resolves the pending promise, stops animating", async () => {
    const el = makeEl();
    const pending = typewrite(el, "abcdef", { speed: 50, pausePunctuation: false, },);
    expect(isTypewriting(),).toBe(true,);

    skipTypewrite(el, "abcdef",);
    await pending;
    expect(el.textContent,).toBe("abcdef",);
    expect(isTypewriting(),).toBe(false,);

    // One scheduler flush: a stale frame would have revealed the next char.
    await tick();
    expect(el.textContent,).toBe("abcdef",);
  });

  test("skip without an active animation just fills the text", () => {
    const el = makeEl();
    skipTypewrite(el, "done",);
    expect(el.textContent,).toBe("done",);
    expect(isTypewriting(),).toBe(false,);
  });
});

// ── resolveDialoguePacing ──────────────────────────────────────────────────

describe("resolveDialoguePacing", () => {
  const base = { speed: 30, pausePunctuation: true, };

  /** Minimal VnScene carrying only a template id. */
  function pacingScene(templateId?: string,): VnScene {
    return {
      messageId: "m1",
      characterName: "Someone",
      text: "...",
      role: "assistant",
      templateId,
    };
  }

  test("no template id returns the base options object unchanged", () => {
    expect(resolveDialoguePacing(base, pacingScene(undefined,),),).toBe(base,);
  });

  test("an unknown template id and no world falls back to base", () => {
    expect(resolveDialoguePacing(base, pacingScene("no-such-template",),),).toBe(base,);
  });

  test("a dialogue-category template id contributes its own text pacing", () => {
    const tense = getDialogueTemplate("dialogue_tense",)!;
    const result = resolveDialoguePacing(base, pacingScene("dialogue_tense",),);
    expect(result.speed,).toBe(tense.body.text?.typewriterSpeed ?? -1,);
    expect(result.pausePunctuation,).toBe(tense.body.text?.pauseOnPunctuation ?? false,);
  });

  test("a scene-category template uses its body.text pacing directly", () => {
    // confrontation ships typewriterSpeed 20 / pauseOnPunctuation false.
    const result = resolveDialoguePacing(base, pacingScene("confrontation",),);
    const expected = getSceneTemplate("confrontation",)?.body.text;
    expect(result.speed,).toBe(expected?.typewriterSpeed ?? -1,);
    expect(result.pausePunctuation,).toBe(expected?.pauseOnPunctuation ?? false,);
  });

  test("a world custom dialogue template resolves when worldId is threaded", () => {
    const worldId = "pacing-test-world";
    const custom = {
      id: "custom_pacing",
      name: "Custom Pacing",
      description: "",
      worldId,
      category: "dialogue" as const,
      version: 1,
      variables: [],
      body: { layout: "overlay", transition: "none", text: { typewriterSpeed: 77, pauseOnPunctuation: false, }, },
      tags: [],
      createdAt: "2024-01-01T00:00:00Z",
      modifiedAt: "2024-01-01T00:00:00Z",
    };

    localStorage.setItem(`vn-templates-${worldId}`, JSON.stringify([custom,],),);

    const result = resolveDialoguePacing(base, pacingScene("custom_pacing",), worldId,);
    expect(result.speed,).toBe(77,);
    expect(result.pausePunctuation,).toBe(false,);

    // Without the world id the custom store is invisible.
    expect(resolveDialoguePacing(base, pacingScene("custom_pacing",),),).toBe(base,);

    localStorage.removeItem(`vn-templates-${worldId}`,);
  });
});
