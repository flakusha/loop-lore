// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { readdirSync, readFileSync, } from "node:fs";
import { join, } from "node:path";
import { VALID_REGEN_STYLES, } from "../../generation/smart-regen";
import { chatStylePicker, REGEN_STYLES, REWRITE_STYLES, } from "./chat-style-picker";

// ── Fake DOM: positioning reads `window`, `document.querySelector` and
// `CSS.escape`, none of which exist in bun test. ──
const g = globalThis as unknown as {
  window?: { innerWidth: number; innerHeight: number };
  document?: { querySelector: (selector: string,) => unknown };
  CSS?: { escape: (value: string,) => string };
};

const original = { window: g.window, document: g.document, CSS: g.CSS, };
let bubbleRect: { left: number; top: number; bottom: number; width: number } | null = null;

interface PickerCtx {
  _stylePicker: { visible: boolean; messageId: string | null; x: number; y: number };
  regenerateVariant?: (messageId: string, style?: string | null,) => Promise<void>;
  $refs?: { messageInput?: HTMLTextAreaElement };
  $nextTick?: (fn: () => void,) => void;
}

function buildCtx(overrides?: Partial<PickerCtx>,): PickerCtx {
  return {
    ...chatStylePicker,
    _stylePicker: { visible: false, messageId: null, x: 0, y: 0, },
    ...overrides,
  } as PickerCtx;
}

function openerEvent(rect: { left: number; top: number; bottom: number; width: number },): Event {
  return {
    target: { getBoundingClientRect: () => rect, },
  } as unknown as Event;
}

beforeEach(() => {
  g.window = { innerWidth: 1000, innerHeight: 800, };
  g.CSS = { escape: (value,) => value, };
  g.document = { querySelector: () => bubbleRect === null ? null : { getBoundingClientRect: () => bubbleRect, }, };
},);

afterEach(() => {
  g.window = original.window;
  g.document = original.document;
  g.CSS = original.CSS;
  bubbleRect = null;
},);

describe("style picker vocabulary parity", () => {
  test("REGEN_STYLES mirrors the backend VALID_REGEN_STYLES keys", () => {
    expect([...REGEN_STYLES,].sort().join(",",),).toBe(Object.keys(VALID_REGEN_STYLES,).sort().join(",",),);
  });

  test("every picker label key is declared in ALL locale files", () => {
    const localesDir = join(import.meta.dir, "../../public/locales",);
    const files = readdirSync(localesDir,).filter((f,) => f.endsWith(".json",));
    expect(files.length,).toBeGreaterThanOrEqual(10,);

    const labelKeys = [...chatStylePicker.regenStyleOptions!, ...chatStylePicker.rewriteStyleOptions!,]
      .map((opt,) => opt.labelKey);

    expect(labelKeys.length,).toBe(REGEN_STYLES.length + REWRITE_STYLES.length,);

    for (const file of files) {
      const catalog = JSON.parse(readFileSync(join(localesDir, file,), "utf8",),) as Record<
        string,
        Record<string, string>
      >;

      for (const key of labelKeys) {
        const [section, leaf,] = [key.slice(0, key.indexOf(".",),), key.slice(key.indexOf(".",) + 1,),];
        expect(catalog[section]?.[leaf], `${file} declares ${key}`,).toBeString();
      }
    }
  });
});

describe("chatStylePicker.openStylePicker", () => {
  test("positions from the opener rect and clamps into the viewport", () => {
    const ctx = buildCtx();
    chatStylePicker.openStylePicker!.call(
      ctx as never,
      "m1",
      openerEvent({ left: 900, top: 100, bottom: 130, width: 30, },),
    );

    expect(ctx._stylePicker.visible,).toBe(true,);
    expect(ctx._stylePicker.messageId,).toBe("m1",);
    expect(ctx._stylePicker.x,).toBe(740,); // innerWidth - 260
    expect(ctx._stylePicker.y,).toBe(136,); // bottom + 6
  });

  test("falls back to the message bubble when the opener already left the layout", () => {
    bubbleRect = { left: 120, top: 40, bottom: 300, width: 600, };
    const ctx = buildCtx();
    chatStylePicker.openStylePicker!.call(ctx as never, "m1", openerEvent({ left: 0, top: 0, bottom: 0, width: 0, },),);

    expect(ctx._stylePicker.visible,).toBe(true,);
    expect(ctx._stylePicker.x,).toBe(128,); // bubble.left + 8
    expect(ctx._stylePicker.y,).toBe(306,); // bubble.bottom + 6
  });
});

describe("chatStylePicker.closeStylePicker", () => {
  test("hides the picker and keeps the anchor message for focus return", () => {
    const ctx = buildCtx();
    chatStylePicker.openStylePicker!.call(
      ctx as never,
      "m1",
      openerEvent({ left: 10, top: 10, bottom: 40, width: 30, },),
    );

    chatStylePicker.closeStylePicker!.call(ctx as never,);
    expect(ctx._stylePicker.visible,).toBe(false,);
    expect(ctx._stylePicker.messageId,).toBe("m1",);
  });

  test("is a no-op when the picker is already closed", () => {
    const ctx = buildCtx();
    chatStylePicker.closeStylePicker!.call(ctx as never,);
    expect(ctx._stylePicker.visible,).toBe(false,);
  });
});

describe("chatStylePicker.regenerateWithStyle", () => {
  test("regenerates the message with the style hint and closes", async () => {
    const calls: { messageId: string; style?: string | null }[] = [];
    const ctx = buildCtx({
      regenerateVariant: async (messageId, style,) => {
        calls.push({ messageId, style, },);
      },
    },);

    chatStylePicker.openStylePicker!.call(
      ctx as never,
      "m1",
      openerEvent({ left: 10, top: 10, bottom: 40, width: 30, },),
    );

    await chatStylePicker.regenerateWithStyle!.call(ctx as never, "m1", "funnier",);
    expect(calls,).toEqual([{ messageId: "m1", style: "funnier", },],);
    expect(ctx._stylePicker.visible,).toBe(false,);
  });

  test("no-ops without an anchor message", async () => {
    const calls: unknown[] = [];
    const ctx = buildCtx({
      regenerateVariant: async () => {
        calls.push(1,);
      },
    },);

    await chatStylePicker.regenerateWithStyle!.call(ctx as never, null, "funnier",);
    expect(calls,).toEqual([],);
  });
});

describe("chatStylePicker.stageRewriteStyle", () => {
  test("stages /rewrite --style in the composer and closes", () => {
    const input = { value: "", focus: () => {}, };
    const ctx = buildCtx({ $refs: { messageInput: input as unknown as HTMLTextAreaElement, }, },);
    chatStylePicker.openStylePicker!.call(
      ctx as never,
      "m1",
      openerEvent({ left: 10, top: 10, bottom: 40, width: 30, },),
    );

    chatStylePicker.stageRewriteStyle!.call(ctx as never, "dramatic",);
    expect(input.value,).toBe("/rewrite --style dramatic ",);
    expect(ctx._stylePicker.visible,).toBe(false,);
  });

  test("closes and no-ops without a composer ref", () => {
    const ctx = buildCtx({ $refs: {}, },);
    chatStylePicker.openStylePicker!.call(
      ctx as never,
      "m1",
      openerEvent({ left: 10, top: 10, bottom: 40, width: 30, },),
    );

    chatStylePicker.stageRewriteStyle!.call(ctx as never, "clear",);
    expect(ctx._stylePicker.visible,).toBe(false,);
  });
});
