// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Branch coverage for tests/setup-globals.ts (bun preload).
 *
 * The guard/assignment lines execute at preload; the stub bodies only run
 * when invoked. This file invokes every stub, and additionally re-executes
 * the module with browser globals stripped (query-suffixed fresh import)
 * so the `addEventListener`/`CustomEvent` fallback branches — dead under
 * Bun's native globals — are covered too. All stripped globals are
 * restored in `finally` so the shared suite is unaffected.
 */
import { describe, expect, test, } from "bun:test";

type Globals = Record<string, unknown>;
type StubDocument = {
  addEventListener: () => void;
  dispatchEvent: () => void;
  querySelector: () => null;
  createElement: (tag: string,) => { style: object; value: string; tagName: string; scrollHeight: number };
};

describe("setup-globals preload stubs", () => {
  test("document stub builds minimal elements", () => {
    const document = (globalThis as unknown as Globals)["document"] as StubDocument;
    expect(document.querySelector(),).toBeNull();
    document.addEventListener();
    document.dispatchEvent();
    const el = document.createElement("div",);
    expect(el.tagName,).toBe("DIV",);
    expect(el.value,).toBe("",);
    expect(el.scrollHeight,).toBe(20,);
    expect(document.createElement("span",).tagName,).toBe("SPAN",);
  });

  test("htmx and Alpine stubs are callable", () => {
    const g = globalThis as unknown as Globals;
    const htmx = g["htmx"] as { process: () => void };
    const Alpine = g["Alpine"] as { store: () => void; initTree: () => void };
    htmx.process();
    Alpine.store();
    Alpine.initTree();
  });

  test("fallback branches install when browser globals are missing", async () => {
    const g = globalThis as unknown as Globals;
    const keys = ["document", "addEventListener", "CustomEvent", "htmx", "Alpine",] as const;
    const saved: Globals = {};
    for (const key of keys) { saved[key] = g[key]; }
    try {
      for (const key of keys) { delete g[key]; }
      expect(g["document"],).toBeUndefined();
      expect(g["CustomEvent"],).toBeUndefined();

      // Fresh module instance (preload ran the bare specifier already).
      await import(`./setup-globals.ts?sm-cover=${Date.now()}`);

      expect(g["document"],).toBeDefined();
      expect(g["htmx"],).toBeDefined();
      expect(g["Alpine"],).toBeDefined();

      // Invoke every freshly installed stub body.
      const document = g["document"] as StubDocument;
      expect(document.createElement("input",).tagName,).toBe("INPUT",);
      document.addEventListener();
      document.dispatchEvent();
      expect(document.querySelector(),).toBeNull();
      (g["addEventListener"] as () => void)();
      const CustomEventCtor = g["CustomEvent"] as new(
        type: string,
        opts?: { detail?: unknown },
      ) => { detail?: unknown; type: string };
      const event = new CustomEventCtor("test-event", { detail: { n: 1, }, },);
      expect(event.detail,).toEqual({ n: 1, },);
      const bare = new CustomEventCtor("bare",);
      expect(bare.detail,).toBeUndefined();
      (g["htmx"] as { process: () => void }).process();
      const AlpineStub = g["Alpine"] as { store: () => void; initTree: () => void };
      AlpineStub.store();
      AlpineStub.initTree();
    } finally {
      for (const key of keys) { g[key] = saved[key]; }
    }
    // Suite globals are intact after restore.
    expect(typeof g["addEventListener"],).toBe("function",);
    expect((g["document"] as StubDocument).createElement("div",).tagName,).toBe("DIV",);
  });
});
