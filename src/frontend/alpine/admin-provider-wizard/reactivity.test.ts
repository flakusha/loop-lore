// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Alpine reactivity contract for the provider connection wizard.
 *
 * Alpine wraps the object returned by adminPage() in a reactive proxy and
 * evaluates the template against THAT proxy. A slice that mutates a
 * closed-over object changes the value without notifying the proxy, so the
 * template never re-renders — the wizard modal never opens. This suite drives
 * the real Alpine reactivity engine (Alpine.reactive / Alpine.effect) and pins
 * that the wizard writes through the proxy.
 */
import { afterAll, beforeEach, expect, test, } from "bun:test";
import { createProviderWizard, } from "./index";

/** The slice of the Alpine runtime this suite uses. */
interface AlpineRuntime {
  reactive: <T extends object,>(target: T,) => T;
  effect: (callback: () => void,) => void;
}

/** Alpine's module-level DOM access — stubbed so the package can be imported. */
class FakeMutationObserver {
  observe(): void {}
  disconnect(): void {}
  takeRecords(): unknown[] {
    return [];
  }
}

const globals = globalThis as unknown as Record<string, unknown>;
const originalWindow = globals.window;
const originalMutationObserver = globals.MutationObserver;
const originalFetch = globalThis.fetch;

globals.MutationObserver = FakeMutationObserver;
globals.window = {
  Element: { prototype: {}, },
  MutationObserver: FakeMutationObserver,
  addEventListener: () => {},
  removeEventListener: () => {},
};

const { default: Alpine, } = await import("alpinejs");
const runtime = Alpine as AlpineRuntime;

beforeEach(() => {
  globalThis.fetch = (async () => Response.json({ providers: [], },)) as unknown as typeof fetch;
},);

afterAll(() => {
  globals.window = originalWindow;
  globals.MutationObserver = originalMutationObserver;
  globalThis.fetch = originalFetch;
},);

/** Flush the queue so Alpine's scheduled effect re-runs. */
async function tick(): Promise<void> {
  await new Promise((resolve,) => setTimeout(resolve, 0,));
}

test("a state change through the slice is observed by Alpine's reactive proxy", async () => {
  const slice = createProviderWizard();
  const scope = runtime.reactive(slice,);

  let observed: boolean | undefined;
  runtime.effect(() => {
    observed = scope.wizard.open;
  },);

  await tick();
  expect(observed,).toBe(false,);

  scope.openProviderWizard();
  await tick();
  expect(observed,).toBe(true,);
});

test("a write that bypasses the reactive proxy stays invisible to the template", async () => {
  const slice = createProviderWizard();
  const scope = runtime.reactive(slice,);

  let observed: boolean | undefined;
  runtime.effect(() => {
    observed = scope.wizard.open;
  },);

  await tick();

  slice.wizard.open = true;
  await tick();
  expect(observed,).toBe(false,);
});
