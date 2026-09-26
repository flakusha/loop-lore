// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for refreshHtmx: the selector/element/attribute guard chain and the
 * htmx.ajax re-issue contract (URL from hx-get, target = selector, swap from
 * hx-swap with innerHTML default).
 *
 * Resource contract: this file owns the `document` and `htmx` globals for the
 * duration of each test and restores both in afterEach — no shared fixtures,
 * no ordering dependence.
 */
import { afterEach, describe, expect, test, } from "bun:test";
import { $, $all, eventCurrentTarget, eventTarget, refreshHtmx, } from "./dom";

interface AjaxCall {
  verb: string;
  url: string;
  target: string;
  swap: string;
}

interface StubEl {
  getAttribute: (name: string,) => string | null;
}

const calls: AjaxCall[] = [];
const originalDocument = globalThis.document;
const originalHtmx = (globalThis as { htmx?: unknown }).htmx;

function stubDocument(el: StubEl | null,): void {
  (globalThis as { document: unknown }).document = {
    querySelector: (_selector: string,) => el,
  };
}

function stubHtmx(): void {
  (globalThis as { htmx?: unknown }).htmx = {
    ajax: (verb: string, url: string, opts: { target: string; swap: string },): void => {
      calls.push({ verb, url, target: opts.target, swap: opts.swap, },);
    },
  };
}

function makeEl(attributes: Record<string, string | null>,): StubEl {
  return {
    getAttribute: (name: string,) => attributes[name] ?? null,
  };
}

afterEach(() => {
  (globalThis as { document: unknown }).document = originalDocument;
  (globalThis as { htmx?: unknown }).htmx = originalHtmx;
  calls.length = 0;
},);

describe("refreshHtmx", () => {
  test("null, undefined, or empty selector issues nothing", () => {
    stubDocument(null,);
    stubHtmx();
    expect(refreshHtmx(null,),).toBe(false,);
    expect(refreshHtmx(undefined,),).toBe(false,);
    expect(refreshHtmx("",),).toBe(false,);
    expect(calls.length,).toBe(0,);
  });

  test("selector matching no element issues nothing", () => {
    stubDocument(null,);
    stubHtmx();
    expect(refreshHtmx("#missing",),).toBe(false,);
    expect(calls.length,).toBe(0,);
  });

  test("element without hx-get issues nothing", () => {
    stubDocument(makeEl({ "hx-get": null, },),);
    stubHtmx();
    expect(refreshHtmx("#panel",),).toBe(false,);
    expect(calls.length,).toBe(0,);
  });

  test("re-issues hx-get with selector target and hx-swap override", () => {
    stubDocument(makeEl({ "hx-get": "/api/panel", "hx-swap": "outerHTML", },),);
    stubHtmx();
    expect(refreshHtmx("#panel",),).toBe(true,);
    expect(calls,).toEqual([
      { verb: "GET", url: "/api/panel", target: "#panel", swap: "outerHTML", },
    ],);
  });

  test("defaults swap to innerHTML when hx-swap is absent", () => {
    stubDocument(makeEl({ "hx-get": "/api/other", },),);
    stubHtmx();
    expect(refreshHtmx("[data-panel]",),).toBe(true,);
    expect(calls,).toEqual([
      { verb: "GET", url: "/api/other", target: "[data-panel]", swap: "innerHTML", },
    ],);
  });
});

describe("query and event helpers", () => {
  test("$ returns the element the root finds, or null", () => {
    const el = makeEl({},) as unknown as HTMLElement;
    stubDocument(el,);
    expect($("#hit",),).toBe(el,);
    stubDocument(null,);
    expect($("#miss",),).toBe(null,);
  });

  test("$ queries an explicit root, $all returns the nodelist", () => {
    const list = { length: 2, } as unknown as NodeListOf<HTMLElement>;
    const none = { length: 0, } as unknown as NodeListOf<HTMLElement>;
    const root = {
      querySelector: () => makeEl({},),
      querySelectorAll: (selector: string,) => (selector === ".all" ? list : none),
    };
    expect($("#any", root as unknown as ParentNode,),).not.toBe(null,);
    expect($all(".all", root as unknown as ParentNode,),).toBe(list,);
    expect($all(".none", root as unknown as ParentNode,),).toBe(none,);
  });

  test("eventTarget and eventCurrentTarget narrow the element", () => {
    const el = makeEl({},) as unknown as HTMLElement;
    const e = { target: el, currentTarget: null, } as unknown as Event;
    expect(eventTarget(e,),).toBe(el,);
    expect(eventCurrentTarget(e,),).toBe(null,);
  });
});
