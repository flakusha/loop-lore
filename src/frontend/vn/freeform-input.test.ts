// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * freeform-input.test.ts — the shared "type your own" VN affordance.
 *
 * Stubs globalThis.document with a minimal fake (choice-cards-render.test.ts
 * convention) sufficient for buildFreeformInput's DOM surface: element
 * construction + the form's submit listener. The cap itself is enforced by
 * the native `maxLength` attribute (the server re-validates authoritatively),
 * so the over-limit path here is that wiring plus the mirror constant,
 * asserted against the backend cap it mirrors.
 *
 * Resource contract (parallel-safe): the module under test is pure — the
 * only global touched is globalThis.document, swapped at module scope and
 * handed back in afterAll; no IO, no timers, no shared fixtures, no ports.
 */
import { afterAll, describe, expect, test, } from "bun:test";
import { VN_FREE_TEXT_MAX_LENGTH, } from "../../chat/service/vn-free-text";
import { buildFreeformInput, VN_INPUT_MAX_LENGTH, } from "./freeform-input";

// ── Fake DOM ────────────────────────────────────────────────────────────────

interface FakeEl {
  tagName: string;
  className: string;
  type: string;
  maxLength: number;
  placeholder: string;
  textContent: string;
  value: string;
  attrs: Record<string, string>;
  children: FakeEl[];
  listeners: Record<string, Array<(event?: unknown,) => void>>;
  append(...els: FakeEl[]): void;
  addEventListener(type: string, fn: (event?: unknown,) => void,): void;
  setAttribute(name: string, value: string,): void;
}

/** */
function makeEl(tag: string,): FakeEl {
  const el: FakeEl = {
    tagName: tag.toUpperCase(),
    className: "",
    type: "",
    maxLength: 0,
    placeholder: "",
    textContent: "",
    value: "",
    attrs: {},
    children: [],
    listeners: {},
    append(...els: FakeEl[]) {
      el.children.push(...els,);
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

// The bun lib types carry no `document`; the fake swaps in via a named
// document-surface view and is handed back in afterAll — later files in the
// shared bun:test process need the load-time DOM surface.
const documentTarget = globalThis as unknown as { document: unknown };
const originalDocument = documentTarget.document;
documentTarget.document = {
  createElement: (tag: string,) => makeEl(tag,),
  addEventListener: () => {},
  dispatchEvent: () => true,
  querySelector: () => null,
};

afterAll(() => {
  documentTarget.document = originalDocument;
},);

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Fire the form's submit listener with a recording event. */
function submitForm(form: FakeEl,): { prevented: boolean } {
  const listener = form.listeners["submit"]?.[0];
  if (!listener) { throw new Error("buildFreeformInput never wired a submit listener",); }

  let prevented = false;
  listener({
    preventDefault: () => {
      prevented = true;
    },
  },);

  return { prevented, };
}

/** Build with fixed labels; returns the fake form. */
function build(): FakeEl {
  return buildFreeformInput({
    className: "vn-question-freeform",
    placeholder: "Say something",
    sendLabel: "Send",
    onSubmit: () => {},
  },) as unknown as FakeEl;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("VN_INPUT_MAX_LENGTH", () => {
  test("mirrors the backend free-text cap, and the built input enforces it", () => {
    // A backend cap bump without a frontend bump fails here: players could
    // type text the server then rejects.
    expect(VN_INPUT_MAX_LENGTH,).toBe(VN_FREE_TEXT_MAX_LENGTH,);
    expect(build().children[0]!.maxLength,).toBe(VN_FREE_TEXT_MAX_LENGTH,);
  });
});

describe("buildFreeformInput", () => {
  test("wires the capped input + send button onto a classed form", () => {
    const form = build();

    expect(form.tagName,).toBe("FORM",);
    expect(form.className,).toBe("vn-question-freeform",);
    expect(form.children,).toHaveLength(2,);

    const [input, send,] = form.children;
    expect(input!.tagName,).toBe("INPUT",);
    expect(input!.type,).toBe("text",);
    expect(input!.className,).toBe("form-input vn-freeform-input",);
    // The over-limit path: native maxLength = the backend cap.
    expect(input!.maxLength,).toBe(VN_INPUT_MAX_LENGTH,);
    expect(input!.placeholder,).toBe("Say something",);
    expect(input!.attrs["aria-label"],).toBe("Say something",);

    expect(send!.tagName,).toBe("BUTTON",);
    expect(send!.type,).toBe("submit",);
    expect(send!.className,).toBe("btn vn-freeform-send",);
    expect(send!.textContent,).toBe("Send",);
  });

  test("submit preventDefaults, trims, delivers, and clears the input", () => {
    const received: string[] = [];
    const form = buildFreeformInput({
      className: "c",
      placeholder: "p",
      sendLabel: "s",
      onSubmit: (text,) => {
        received.push(text,);
      },
    },) as unknown as FakeEl;

    const input = form.children[0]!;

    input.value = "  hello vn  ";
    const { prevented, } = submitForm(form,);

    expect(prevented,).toBe(true,);
    expect(received,).toEqual(["hello vn",],);
    expect(input.value,).toBe("",);
  });

  test("a whitespace-only value is swallowed: default prevented, no callback", () => {
    const received: string[] = [];
    const form = buildFreeformInput({
      className: "c",
      placeholder: "p",
      sendLabel: "s",
      onSubmit: (text,) => {
        received.push(text,);
      },
    },) as unknown as FakeEl;

    const input = form.children[0]!;

    input.value = "   ";
    const { prevented, } = submitForm(form,);

    expect(prevented,).toBe(true,);
    expect(received,).toEqual([],);
  });

  test("clearing on accept means a resubmit cannot double-fire", () => {
    let calls = 0;
    const form = buildFreeformInput({
      className: "c",
      placeholder: "p",
      sendLabel: "s",
      onSubmit: () => {
        calls++;
      },
    },) as unknown as FakeEl;

    const input = form.children[0]!;

    input.value = "once";
    submitForm(form,);
    submitForm(form,);

    expect(calls,).toBe(1,);
  });
});
