// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for frontend/vn/choice-cards-render.ts — choice card DOM rendering.
 *
 * Stubs globalThis.document with a minimal fake (gallery-upload.test.ts
 * convention) sufficient for renderChoiceCards' DOM surface.
 */
import { describe, expect, test, } from "bun:test";
import { renderChoiceCards, } from "./choice-cards-render";

// ── Fake DOM ────────────────────────────────────────────────────────────────

interface FakeEl {
  tagName: string;
  className: string;
  type: string;
  disabled: boolean;
  textContent: string;
  attrs: Record<string, string>;
  children: FakeEl[];
  listeners: Record<string, Array<() => void>>;
  append(...els: FakeEl[]): void;
  replaceChildren(): void;
  addEventListener(type: string, fn: () => void,): void;
  setAttribute(name: string, value: string,): void;
}

/** */
function makeEl(tag: string,): FakeEl {
  const el: FakeEl = {
    tagName: tag.toUpperCase(),
    className: "",
    type: "",
    disabled: false,
    textContent: "",
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

(globalThis as unknown as { document: unknown }).document = {
  createElement: (tag: string,) => makeEl(tag,),
  // Superset of tests/setup-globals.ts: real modules (e.g. alpine/htmx.ts)
  // re-evaluate mid-process and touch these.
  addEventListener: () => {},
  dispatchEvent: () => true,
  querySelector: () => null,
};

// ── Fixture builder (test seam) ─────────────────────────────────────────────

/** */
function choice(overrides: Record<string, unknown> = {},): Record<string, unknown> {
  return { id: "c1", text: "Go left", label: undefined, description: null, ...overrides, };
}

/** Labels of each card, via the label span. */
function cardLabels(list: FakeEl[],): string[] {
  return list.map((c,) => c.children[0]?.textContent ?? "");
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("renderChoiceCards", () => {
  test("null container is a no-op", () => {
    renderChoiceCards(null as unknown as HTMLElement, [], () => {},);
  });

  test("empty choices renders an empty choice list", () => {
    const container = makeEl("div",);
    renderChoiceCards(container as unknown as HTMLElement, [], () => {},);
    expect(container.children.length,).toBe(1,);
    expect(container.children[0]!.className,).toBe("vn-choice-list",);
    expect(container.children[0]!.children.length,).toBe(0,);
  });

  test("renders available cards first, then selected; label falls back to text", () => {
    const container = makeEl("div",);
    const choices = [
      choice({ id: "sel", text: "Stay put", selected: true, },),
      choice({ id: "av", text: "Go left", },),
      choice({ id: "lb", label: "Custom label", text: "raw text", },),
    ] as never;
    renderChoiceCards(container as unknown as HTMLElement, choices, () => {},);
    const cards = container.children[0]!.children;
    expect(cardLabels(cards,),).toEqual(["Go left", "Custom label", "Stay put",],);
    expect(cards[0]!.className,).toBe("vn-choice-card",);
    expect(cards[2]!.className,).toBe("vn-choice-card vn-choice-card--selected",);
  });

  test("selected cards are disabled with aria-selected; available are clickable buttons", () => {
    const container = makeEl("div",);
    const calls: string[] = [];
    const choices = [
      choice({ id: "sel", text: "Stay put", selected: true, },),
      choice({ id: "av", text: "Go left", },),
    ] as never;
    renderChoiceCards(container as unknown as HTMLElement, choices, (id,) => calls.push(id,),);
    const [available, selected,] = container.children[0]!.children;
    expect(available!.type,).toBe("button",);
    expect(available!.disabled,).toBe(false,);
    expect(selected!.disabled,).toBe(true,);
    expect(selected!.attrs["aria-selected"],).toBe("true",);
    // Selected card must not trigger onSelect.
    expect(selected!.listeners["click"],).toBeUndefined();
    available!.listeners["click"]![0]!();
    expect(calls,).toEqual(["av",],);
  });

  test("description span rendered only when present", () => {
    const container = makeEl("div",);
    const choices = [
      choice({ id: "a", text: "A", description: "A narrow path", },),
      choice({ id: "b", text: "B", description: null, },),
    ] as never;
    renderChoiceCards(container as unknown as HTMLElement, choices, () => {},);
    const [withDesc, withoutDesc,] = container.children[0]!.children;
    expect(withDesc!.children.length,).toBe(2,);
    expect(withDesc!.children[1]!.className,).toBe("vn-choice-card__desc",);
    expect(withDesc!.children[1]!.textContent,).toBe("A narrow path",);
    expect(withoutDesc!.children.length,).toBe(1,);
  });

  test("re-render clears previous cards", () => {
    const container = makeEl("div",);
    const el = container as unknown as HTMLElement;
    renderChoiceCards(el, [choice({ id: "a", },),] as never, () => {},);
    renderChoiceCards(el, [choice({ id: "b", },), choice({ id: "c", },),] as never, () => {},);
    expect(container.children.length,).toBe(1,);
    expect(cardLabels(container.children[0]!.children,),).toEqual(["Go left", "Go left",],);
  });
});
