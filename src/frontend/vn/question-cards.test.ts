// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for frontend/vn/question-cards.ts — init/destroy lifecycle, load
 * rendering, answer recording, and the "a failing side effect never loses the
 * recorded answer" guarantee.
 *
 * apiFetch is mocked at the module seam (choice-cards.test.ts convention); DOM
 * is the same minimal fake renderQuestionCards needs.
 */
import { afterAll, afterEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import {
  answerQuestion,
  destroyQuestionCards,
  initQuestionCards,
  loadQuestions,
} from "./question-cards";

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
}

/** */
function jsonRes(body: unknown, status = 200,): Response {
  return Response.json(body, { status, },);
}

// ── Fake DOM (choice-cards.test.ts convention) ──────────────────────────────

interface FakeEl {
  className: string;
  disabled: boolean;
  type: string;
  textContent: string;
  dataset: Record<string, string>;
  children: FakeEl[];
  listeners: Record<string, Array<() => void>>;
  append(...els: FakeEl[]): void;
  replaceChildren(): void;
  addEventListener(type: string, fn: () => void,): void;
}

/** */
function makeEl(): FakeEl {
  const el: FakeEl = {
    className: "",
    disabled: false,
    type: "",
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

const originalDocument = (globalThis as { document?: unknown }).document;
(globalThis as unknown as { document: unknown }).document = {
  createElement: () => makeEl(),
  addEventListener: () => {},
  dispatchEvent: () => true,
  querySelector: () => null,
};

afterAll(() => {
  (globalThis as unknown as { document: unknown }).document = originalDocument;
},);

// ── Fixtures ────────────────────────────────────────────────────────────────

/** API question row with defaults; overrides win. */
function rawQuestion(overrides: Record<string, unknown> = {},): Record<string, unknown> {
  return {
    id: "q1",
    chat_id: "chat-1",
    scene_index: 2,
    question_type: "lore",
    question_text: "Who opened the door?",
    speaker_id: "Ada",
    options: [
      { id: "o1", text: "I did", emotion_modifier: 5, relationship_modifier: 10, },
      { id: "o2", text: "Not me", emotion_modifier: -5, relationship_modifier: -10, },
    ],
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

/** Init with a fresh fake container; returns it for render assertions. */
function boot(): FakeEl {
  const container = makeEl();
  initQuestionCards(container as unknown as HTMLElement, "chat-1", 2,);
  return container;
}

/** Walk list → card → options container → option buttons. */
function optionButtons(container: FakeEl,): FakeEl[] {
  const list = container.children[0]!;
  const cards = list.children;
  if (cards.length === 0) { return []; }
  const optionsEl = cards[0]!.children.find((c,) => c.className === "vn-question-card-options")!;
  return optionsEl.children;
}

afterEach(() => {
  apiHandler = null;
  apiCalls = [];
  destroyQuestionCards();
},);

// ── Tests ───────────────────────────────────────────────────────────────────

describeOrSkip("initQuestionCards / destroyQuestionCards", () => {
  test("loadQuestions before init never fetches", async () => {
    await loadQuestions();
    expect(apiCalls.length,).toBe(0,);
  });

  test("destroy clears state and subsequent loadQuestions is a no-op", async () => {
    const container = boot();
    apiHandler = () => jsonRes({ questions: [rawQuestion(),], },);
    await loadQuestions();
    destroyQuestionCards();

    const callsBefore = apiCalls.length;
    await loadQuestions();
    expect(apiCalls.length,).toBe(callsBefore,);
    expect(container.children.length,).toBe(1,); // untouched by the no-op load
  });
},);

describeOrSkip("loadQuestions", () => {
  test("fetches scene questions and renders speaker, text, and option buttons", async () => {
    const container = boot();
    apiHandler = () => jsonRes({ questions: [rawQuestion(),], },);

    await loadQuestions();
    expect(apiCalls.length,).toBe(1,);
    expect(apiCalls[0]!.url,).toBe("/api/v1/chats/chat-1/vn-questions?sceneIndex=2",);

    const list = container.children[0]!;
    expect(list.className,).toBe("vn-question-list",);

    const card = list.children[0]!;
    expect(card.className,).toBe("vn-question-card",);
    expect(card.children[0]!.className,).toBe("vn-question-card-speaker",);
    expect(card.children[0]!.textContent,).toBe("Ada",);
    expect(card.children[1]!.className,).toBe("vn-question-card-text",);
    expect(card.children[1]!.textContent,).toBe("Who opened the door?",);

    const buttons = optionButtons(container,);
    expect(buttons.length,).toBe(2,);
    expect(buttons[0]!.type,).toBe("button",);
    expect(buttons[0]!.dataset.questionId,).toBe("q1",);
    expect(buttons[0]!.children[0]!.textContent,).toBe("I did",);
    // Impact preview is rendered as text next to the label.
    expect(buttons[0]!.children[1]!.className,).toBe("vn-question-option-impact",);
    expect(buttons[0]!.children[1]!.textContent,).toBe("+10",);
    expect(buttons[1]!.children[1]!.textContent,).toBe("-10",);
  });

  test("a question with no speaker omits the speaker element", async () => {
    const container = boot();
    apiHandler = () => jsonRes({ questions: [rawQuestion({ speaker_id: null, },),], },);

    await loadQuestions();
    const card = container.children[0]!.children[0]!;
    expect(card.children[0]!.className,).toBe("vn-question-card-text",);
  });

  test("network error clears questions instead of throwing", async () => {
    boot();
    apiHandler = () => {
      throw new Error("network",);
    };

    await loadQuestions();
    expect(apiCalls.length,).toBe(1,);
  });
},);

describeOrSkip("answerQuestion", () => {
  test("posts the answer, records it, and disables the options", async () => {
    const container = boot();
    apiHandler = (url,) => {
      if (url.includes("/answer",)) {
        return jsonRes({
          question: rawQuestion({
            status: "answered",
            selected_option_id: "o2",
            answered_at: "2024-01-02T00:00:00Z",
          },),
          option: { id: "o2", text: "Not me", },
          nextSceneId: null,
        },);
      }

      return jsonRes({ questions: [rawQuestion(),], },);
    };

    await loadQuestions();
    const result = await answerQuestion("q1", "o2",);

    expect(result,).not.toBeNull();
    expect(result!.question.status,).toBe("answered",);
    expect(result!.question.selected_option_id,).toBe("o2",);
    expect(apiCalls[1]!.url,).toBe("/api/v1/chats/chat-1/vn-questions/q1/answer",);
    expect(apiCalls[1]!.opts.method,).toBe("POST",);

    for (const btn of optionButtons(container,)) {
      expect(btn.disabled,).toBe(true,);
    }
  });

  test("a failing location side effect does NOT lose the recorded answer", async () => {
    boot();
    apiHandler = (url,) => {
      if (url.endsWith("/location",)) {
        // Side-effect endpoint fails after the answer already persisted.
        return jsonRes({ error: "boom", }, 500,);
      }

      if (url.includes("/answer",)) {
        return jsonRes({
          question: rawQuestion({ status: "answered", selected_option_id: "o1", },),
          option: { id: "o1", text: "I did", },
          nextSceneId: null,
          locationId: "loc-1",
        },);
      }

      return jsonRes({ questions: [rawQuestion(),], },);
    };

    await loadQuestions();
    const result = await answerQuestion("q1", "o1",);

    expect(result,).not.toBeNull();
    expect(result!.locationId,).toBe("loc-1",);
    expect(result!.locationChanged,).toBe(false,);
    // The answer POST still happened and the answer still stands.
    expect(apiCalls.some((c,) => c.url.includes("/answer",)),).toBe(true,);
  });

  test("a THROWN side effect does not lose the recorded answer", async () => {
    boot();
    apiHandler = (url,) => {
      if (url.endsWith("/location",)) {
        throw new Error("network",);
      }

      if (url.includes("/answer",)) {
        return jsonRes({
          question: rawQuestion({ status: "answered", selected_option_id: "o1", },),
          option: { id: "o1", text: "I did", },
          nextSceneId: "scene-9",
          locationId: "loc-1",
        },);
      }

      return jsonRes({ questions: [rawQuestion(),], },);
    };

    await loadQuestions();
    const result = await answerQuestion("q1", "o1",);

    expect(result,).not.toBeNull();
    expect(result!.nextSceneId,).toBe("scene-9",);
    expect(result!.locationChanged,).toBe(false,);
  });

  test("a non-ok answer response returns null and records nothing", async () => {
    const container = boot();
    apiHandler = (url,) => {
      if (url.includes("/answer",)) { return jsonRes({ error: "nope", }, 400,); }
      return jsonRes({ questions: [rawQuestion(),], },);
    };

    await loadQuestions();
    const result = await answerQuestion("q1", "o1",);
    expect(result,).toBeNull();

    // Nothing changed: options are still actionable.
    for (const btn of optionButtons(container,)) {
      expect(btn.disabled,).toBe(false,);
    }
  });

  test("answering an unknown question id returns null without fetching", async () => {
    boot();
    apiHandler = () => jsonRes({ questions: [rawQuestion(),], },);
    await loadQuestions();

    const callsBefore = apiCalls.length;
    expect(await answerQuestion("no-such-question", "o1",),).toBeNull();
    expect(apiCalls.length,).toBe(callsBefore,);
  });
},);
