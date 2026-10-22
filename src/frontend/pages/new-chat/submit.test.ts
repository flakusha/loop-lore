// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for the new-chat create payload.
 *
 * A variant chat is server-owned: the client sends `variant` and NO type/mode,
 * so the server can pin the canonical triple from the taxonomy table. A
 * standard chat sends the form's type/mode instead. The fine-tune overrides
 * (world, turn strategy, visibility) ride along in both cases - the world in
 * particular is the one field the variant does NOT own, so it must survive.
 */
import { afterEach, beforeEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../../test-utils/isolate-only";
import { createCtx, } from "./state";

interface FakeEl {
  value: string;
  checked: boolean;
  disabled: boolean;
  textContent: string;
  querySelector(sel: string,): FakeEl | null;
  addEventListener(type: string, fn: (e: unknown,) => void,): void;
}

function makeEl(value = "", checked = false,): FakeEl {
  return {
    value,
    checked,
    disabled: false,
    textContent: "",
    querySelector: () => null,
    addEventListener: () => {},
  };
}

/** Every element the payload collector reads, keyed by its exact selector. */
const els = new Map<string, FakeEl>();

/** The POST bodies the mocked feFetch saw. */
let calls: { url: string; body: Record<string, unknown> }[] = [];

/** Where the success path redirected to. */
let redirected = "";

if (ISOLATED) {
  mock.module("../../fe-fetch", () => ({
    feFetch: async (url: string, opts: RequestInit = {},) => {
      calls.push({ url, body: JSON.parse(String(opts.body,),) as Record<string, unknown>, },);
      return new Response(JSON.stringify({ id: "chat-1", },), { status: 200, },);
    },
    getCsrfToken: () => "",
  }),);

  mock.module("../../ui", () => ({ showToast: () => {}, }),);
}

const host = globalThis as unknown as { document?: unknown; location?: unknown };
const originalDocument = host.document;
const originalLocation = host.location;

beforeEach(() => {
  calls = [];
  redirected = "";
  els.clear();
  els.set("#persona-select", makeEl(),);
  els.set("#chat-mode", makeEl("direct",),);
  els.set("#gm-guided-toggle", makeEl("", false,),);
  els.set("#chat-variant", makeEl("standard",),);
  els.set("#chat-turn-strategy", makeEl(),);
  els.set("#chat-world", makeEl(),);
  els.set("#chat-visibility", makeEl(),);
  els.set("#chat-visual-novel", makeEl("", false,),);
  els.set("#chat-template", makeEl(),);
  els.set('input[name="memory_carry"]:checked', makeEl("full",),);

  host.document = {
    querySelector: (sel: string,) => els.get(sel,) ?? null,
    cookie: "",
  };

  host.location = {
    assign: (url: string,) => {
      redirected = url;
    },
  };
},);

afterEach(() => {
  host.document = originalDocument;
  host.location = originalLocation;
},);

/**
 * Bind the submit handler to a fresh context and fire it.
 * @param chatTypeValue - the form's chat-type value
 * @returns the POST body the client sent
 */
async function submitForm(chatTypeValue: string,): Promise<Record<string, unknown>> {
  const { bindSubmitHandler, } = await import("./submit");

  const nameInput = makeEl("A chat",);
  const submitBtn = makeEl();
  const form = makeEl();
  form.querySelector = (sel,) =>
    sel === '[name="name"]'
      ? nameInput
      : sel === '[type="submit"]'
      ? submitBtn
      : null;

  const handlers: ((e: unknown,) => void)[] = [];
  form.addEventListener = (type, fn,) => {
    if (type === "submit") { handlers.push(fn,); }
  };

  const ctx = createCtx();
  ctx.form = form as unknown as HTMLFormElement;
  ctx.chatType = makeEl(chatTypeValue,) as unknown as HTMLSelectElement;

  bindSubmitHandler(ctx,);
  await handlers[0]?.({ preventDefault: () => {}, },);

  expect(calls.length,).toBe(1,);
  expect(calls[0]!.url,).toBe("/api/v1/chats",);
  return calls[0]!.body;
}

describeOrSkip("new-chat create payload", () => {
  test("a variant chat posts the variant and no type/mode", async () => {
    els.get("#chat-variant",)!.value = "rpg";
    els.get("#chat-mode",)!.value = "direct";

    const body = await submitForm("direct",);

    expect(body.variant,).toBe("rpg",);
    expect(body.type,).toBeUndefined();
    expect(body.mode,).toBeUndefined();
    expect(redirected,).toBe("/views/chat?chatid=chat-1",);
  });

  test("a standard chat posts the form's type/mode and no variant", async () => {
    els.get("#chat-variant",)!.value = "standard";
    els.get("#chat-mode",)!.value = "story";

    const body = await submitForm("group",);

    expect(body.variant,).toBeUndefined();
    expect(body.type,).toBe("group",);
    expect(body.mode,).toBe("story",);
  });

  test("the world rides along with a variant chat", async () => {
    els.get("#chat-variant",)!.value = "rpg";
    els.get("#chat-world",)!.value = "world-9";

    const body = await submitForm("direct",);

    expect(body.variant,).toBe("rpg",);
    expect(body.worldId,).toBe("world-9",);
  });
},);
