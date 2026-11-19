// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for the new-chat greeting picker's DOM update. A fake <select>
 * is enough to pin the visible/hidden states and the reset-on-switch rule.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { updateGreetingPicker, } from "./selection";
import { createCtx, type NewChatCtx, } from "./state";

class FakeEl {
  value = "";
  textContent = "";
  style: Record<string, string> = {};
  children: FakeEl[] = [];
  append(...nodes: FakeEl[]): void {
    this.children.push(...nodes,);
  }
  replaceChildren(...nodes: FakeEl[]): void {
    this.children = nodes;
  }
}

const host = globalThis as unknown as { document?: unknown };
const originalDocument = host.document;

let ctx: NewChatCtx;
let group: FakeEl;
let select: FakeEl;

beforeEach(() => {
  group = new FakeEl();
  select = new FakeEl();
  host.document = { createElement: () => new FakeEl(), };
  ctx = createCtx();
  ctx.greetingGroup = group as unknown as HTMLElement;
  ctx.greetingSelect = select as unknown as HTMLSelectElement;
},);

afterEach(() => {
  host.document = originalDocument;
},);

const labels = (): string[] => select.children.map((child,) => child.textContent);

describe("updateGreetingPicker", () => {
  test("hides the picker when no character is selected", () => {
    updateGreetingPicker(ctx,);
    expect(group.style.display,).toBe("none",);
    expect(labels(),).toEqual([],);
  });

  test("hides the picker for a character with no alternate greetings", () => {
    ctx.selected = [{ id: "c1", alternate_greetings: null, },];
    updateGreetingPicker(ctx,);
    expect(group.style.display,).toBe("none",);
    expect(labels(),).toEqual([],);
  });

  test("shows one indexed option for a single alternate greeting", () => {
    ctx.selected = [{ id: "c1", alternate_greetings: '["Hi!"]', },];
    updateGreetingPicker(ctx,);
    expect(group.style.display,).toBe("",);
    expect(labels(),).toEqual(["Default greeting", "Alternate greeting 1",],);
    expect(select.value,).toBe("",);
  });

  test("shows one option per alternate greeting", () => {
    ctx.selected = [{ id: "c1", alternate_greetings: '["Hi!","Hello!","Hey!"]', },];
    updateGreetingPicker(ctx,);
    expect(labels(),).toEqual([
      "Default greeting",
      "Alternate greeting 1",
      "Alternate greeting 2",
      "Alternate greeting 3",
    ],);
  });

  test("a character switch rebuilds options and resets to the default greeting", () => {
    ctx.selected = [{ id: "a", alternate_greetings: '["Alpha one","Alpha two"]', },];
    updateGreetingPicker(ctx,);
    select.value = "1";

    ctx.selected = [{ id: "b", alternate_greetings: '["Beta only"]', },];
    updateGreetingPicker(ctx,);

    expect(labels(),).toEqual(["Default greeting", "Alternate greeting 1",],);
    expect(select.value,).toBe("",);
  });

  test("removing the character hides the picker again", () => {
    ctx.selected = [{ id: "c1", alternate_greetings: '["Hi!"]', },];
    updateGreetingPicker(ctx,);
    ctx.selected = [];
    updateGreetingPicker(ctx,);
    expect(group.style.display,).toBe("none",);
    expect(labels(),).toEqual([],);
  });
});
