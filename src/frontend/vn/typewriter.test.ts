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
import { isTypewriting, skipTypewrite, typewrite, } from "./typewriter";

// ── Global stubs ────────────────────────────────────────────────────────────

type Globals = Record<string, unknown>;
const originalMatchMedia = (globalThis as Globals).matchMedia;
const originalRaf = (globalThis as Globals).requestAnimationFrame;
const originalCancelRaf = (globalThis as Globals).cancelAnimationFrame;

let reducedMotion = false;
const pendingFrames = new Map<number, () => void>();
let nextFrameId = 0;

/** Flush pending macrotasks once: lets stubbed animation frames settle. */
function tick(): Promise<void> {
  const { promise, resolve, } = Promise.withResolvers<void>();
  setTimeout(resolve, 0,);
  return promise;
}

beforeEach(() => {
  reducedMotion = false;
  pendingFrames.clear();
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
