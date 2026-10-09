// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for frontend/vn/question-cards-render.ts — question card DOM rendering.
 *
 * Stubs globalThis.document with a minimal fake (choice-cards-render.test.ts
 * convention) sufficient for renderQuestionCards' DOM surface. The assertions
 * that matter are the ones the UI depends on: clicking an option reports the
 * question+option pair, an answered question is closed, and Skip exists only
 * while the question is still open.
 */
import { afterAll, describe, expect, test, } from "bun:test";
import type { VnQuestion, VnQuestionOption, } from "./question-cards";
import { renderQuestionCards, } from "./question-cards-render";

// ── Fake DOM ────────────────────────────────────────────────────────────────

interface FakeEl {
  tagName: string;
  className: string;
  type: string;
  disabled: boolean;
  textContent: string;
  dataset: Record<string, string>;
  children: FakeEl[];
  listeners: Record<string, Array<() => void>>;
  append(...els: FakeEl[]): void;
  replaceChildren(): void;
  addEventListener(type: string, fn: () => void,): void;
}

function makeEl(tag: string,): FakeEl {
  const el: FakeEl = {
    tagName: tag.toUpperCase(),
    className: "",
    type: "",
    disabled: false,
    textContent: "",
    dataset: {},
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
  };

  return el;
}

// Module-scope global write must be handed back in afterAll — later files in
// the shared bun:test process need the load-time DOM surface.
const originalDocument = (globalThis as { document?: unknown }).document;
(globalThis as unknown as { document: unknown }).document = {
  createElement: (tag: string,) => makeEl(tag,),
  addEventListener: () => {},
  dispatchEvent: () => true,
  querySelector: () => null,
};

afterAll(() => {
  (globalThis as unknown as { document: unknown }).document = originalDocument;
},);

// ── Fixtures ────────────────────────────────────────────────────────────────

function option(overrides: Partial<VnQuestionOption> = {},): VnQuestionOption {
  return {
    id: "o1",
    text: "I opened it",
    emotion_modifier: 0,
    relationship_modifier: 0,
    next_scene_id: null,
    consequence: null,
    ...overrides,
  };
}

function question(overrides: Partial<VnQuestion> = {},): VnQuestion {
  return {
    id: "q1",
    chat_id: "chat-1",
    scene_index: 2,
    question_type: "lore",
    question_text: "Who opened the door?",
    speaker_id: "Ada",
    options: [option(), option({ id: "o2", text: "Someone else did", },),],
    next_scene_id: null,
    consequences: {},
    relationship_impact: {},
    mood_impact: {},
    status: "available",
    selected_option_id: null,
    answered_at: null,
    created_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

/** list → card → options container → option buttons. */
function optionButtons(container: FakeEl, cardIndex = 0,): FakeEl[] {
  const card = container.children[0]!.children[cardIndex]!;
  const optionsEl = card.children.find((c,) => c.className === "vn-question-card-options")!;
  return optionsEl.children;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("renderQuestionCards", () => {
  test("null container is a no-op", () => {
    renderQuestionCards(null as unknown as HTMLElement, [], () => {},);
  });

  test("renders speaker, question text, and one button per option", () => {
    const container = makeEl("div",);
    renderQuestionCards(container as unknown as HTMLElement, [question(),], () => {},);

    const list = container.children[0]!;
    expect(list.className,).toBe("vn-question-list",);

    const card = list.children[0]!;
    expect(card.className,).toBe("vn-question-card",);
    expect(card.dataset.questionId,).toBe("q1",);
    expect(card.children[0]!.className,).toBe("vn-question-card-speaker",);
    expect(card.children[0]!.textContent,).toBe("Ada",);
    expect(card.children[1]!.className,).toBe("vn-question-card-text",);
    expect(card.children[1]!.textContent,).toBe("Who opened the door?",);

    const buttons = optionButtons(container,);
    expect(buttons.length,).toBe(2,);
    expect(buttons[0]!.type,).toBe("button",);
    expect(buttons[0]!.dataset.questionId,).toBe("q1",);
    expect(buttons[0]!.dataset.optionId,).toBe("o1",);
    expect(buttons[0]!.children[0]!.textContent,).toBe("I opened it",);
    expect(buttons[1]!.dataset.optionId,).toBe("o2",);
  });

  test("no speaker element when the question has no speaker", () => {
    const container = makeEl("div",);
    renderQuestionCards(container as unknown as HTMLElement, [question({ speaker_id: null, },),], () => {},);

    const card = container.children[0]!.children[0]!;
    expect(card.children[0]!.className,).toBe("vn-question-card-text",);
  });

  test("clicking an option reports the question and option pair", () => {
    const container = makeEl("div",);
    const calls: [string, string,][] = [];
    renderQuestionCards(
      container as unknown as HTMLElement,
      [question(), question({ id: "q2", question_text: "Second?", },),],
      (questionId, optionId,) => calls.push([questionId, optionId,],),
    );

    optionButtons(container, 0,)[1]!.listeners["click"]![0]!();
    optionButtons(container, 1,)[0]!.listeners["click"]![0]!();

    expect(calls,).toEqual([["q1", "o2",], ["q2", "o1",],],);
  });

  test("an answered question renders its options disabled and closed", () => {
    const container = makeEl("div",);
    renderQuestionCards(
      container as unknown as HTMLElement,
      [question({ status: "answered", selected_option_id: "o2", },),],
      () => {},
    );

    const [button,] = optionButtons(container,);
    expect(button!.disabled,).toBe(true,);
    expect(button!.className,).toBe("vn-question-option vn-question-option-answered",);
  });

  test("an available question leaves its options actionable", () => {
    const container = makeEl("div",);
    renderQuestionCards(container as unknown as HTMLElement, [question(),], () => {},);

    const [button,] = optionButtons(container,);
    expect(button!.disabled,).toBe(false,);
    expect(button!.className,).toBe("vn-question-option",);
  });

  test("the impact hint is signed and omitted when there is no impact", () => {
    const container = makeEl("div",);
    renderQuestionCards(
      container as unknown as HTMLElement,
      [question({
        options: [
          option({ id: "up", text: "Warm up", relationship_modifier: 12, },),
          option({ id: "down", text: "Cool off", relationship_modifier: -7, },),
          option({ id: "flat", text: "Nothing", relationship_modifier: 0, },),
        ],
      },),],
      () => {},
    );

    const [up, down, flat,] = optionButtons(container,);
    // A signed value gets a hint span carrying the signed text.
    expect(up!.children[1]!.className,).toBe("vn-question-option-impact",);
    expect(up!.children[1]!.textContent,).toBe("+12",);
    expect(down!.children[1]!.textContent,).toBe("-7",);
    // Zero carries no hint at all — the label alone.
    expect(flat!.children.length,).toBe(1,);
  });

  test("Skip appears for an open question and dismisses that question", () => {
    const container = makeEl("div",);
    const skipped: string[] = [];
    renderQuestionCards(
      container as unknown as HTMLElement,
      [question(), question({ id: "q2", question_text: "Second?", },),],
      () => {},
      (questionId,) => skipped.push(questionId,),
    );

    const skipButtons = container.children[0]!.children.map((card,) =>
      card.children.find((c,) => c.className === "vn-question-skip")!
    );

    expect(skipButtons.length,).toBe(2,);
    expect(skipButtons[0]!.dataset.questionId,).toBe("q1",);
    skipButtons[1]!.listeners["click"]![0]!();
    expect(skipped,).toEqual(["q2",],);
  });

  test("no Skip button once the question is answered", () => {
    const container = makeEl("div",);
    renderQuestionCards(
      container as unknown as HTMLElement,
      [question({ status: "answered", },),],
      () => {},
      () => {},
    );

    const card = container.children[0]!.children[0]!;
    expect(card.children.find((c,) => c.className === "vn-question-skip"),).toBeUndefined();
  });

  test("no Skip button when the caller supplied no skip handler", () => {
    const container = makeEl("div",);
    renderQuestionCards(container as unknown as HTMLElement, [question(),], () => {},);

    const card = container.children[0]!.children[0]!;
    expect(card.children.find((c,) => c.className === "vn-question-skip"),).toBeUndefined();
  });

  test("a question with no options renders a card with zero buttons", () => {
    const container = makeEl("div",);
    renderQuestionCards(container as unknown as HTMLElement, [question({ options: [], },),], () => {},);

    expect(optionButtons(container,).length,).toBe(0,);
  });

  test("re-render clears the previous cards", () => {
    const container = makeEl("div",);
    const el = container as unknown as HTMLElement;
    renderQuestionCards(el, [question(),], () => {},);
    renderQuestionCards(el, [question({ id: "q2", },), question({ id: "q3", },),], () => {},);

    expect(container.children.length,).toBe(1,);
    expect(container.children[0]!.children.map((c,) => c.dataset.questionId),).toEqual(["q2", "q3",],);
  });
});
