// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * MenuList: the shared list component behind the chat picker, harness and
 * models overlays. Pure component — render(width) + handleInput(raw keys).
 */
import { describe, expect, it, } from "bun:test";
import { MenuList, } from "./menu";
import { stripAnsi, } from "./test-support";

const UP = "\x1b[A";
const DOWN = "\x1b[B";
const ENTER = "\r";

function build(rows: string[], onSelect: (index: number,) => void = () => {},): MenuList {
  return new MenuList({ rows: () => rows, onSelect, vi: true, },);
}

describe("MenuList", () => {
  it("renders rows with a cursor marker and no marker on the rest", () => {
    const menu = build(["one", "two",],);
    const rows = menu.render(20,) as string[];
    expect(rows,).toHaveLength(2,);
    expect(stripAnsi(rows[0]!,),).toContain("> one",);
    expect(stripAnsi(rows[1]!,),).toContain("  two",);
  });

  it("highlights the cursor row across the full width", () => {
    const menu = build(["one",],);
    const [row,] = menu.render(20,) as string[];
    expect(row!,).toContain("\x1b[46m",);
    expect(stripAnsi(row!,),).toHaveLength(20,);
  });

  it("moves the cursor with arrows and vi keys, wrapping", () => {
    const menu = build(["a", "b", "c",],);
    menu.handleInput(DOWN,);
    expect(menu.getCursor(),).toBe(1,);
    menu.handleInput("j",);
    expect(menu.getCursor(),).toBe(2,);
    menu.handleInput(DOWN,);
    expect(menu.getCursor(),).toBe(0,);
    menu.handleInput(UP,);
    expect(menu.getCursor(),).toBe(2,);
    menu.handleInput("k",);
    expect(menu.getCursor(),).toBe(1,);
  });

  it("reports Enter through onSelect with the cursor row", () => {
    const picked: number[] = [];
    const menu = build(["a", "b",], (index,) => picked.push(index,),);
    menu.handleInput(DOWN,);
    menu.handleInput(ENTER,);
    expect(picked,).toEqual([1,],);
  });

  it("ignores every key while empty", () => {
    const menu = build([],);
    menu.handleInput(DOWN,);
    menu.handleInput(ENTER,);
    expect(menu.getCursor(),).toBe(0,);
    expect(menu.render(10,),).toEqual([],);
  });

  it("windows the viewport around the cursor when rows overflow", () => {
    const rows = Array.from({ length: 30, }, (_, i,) => `row-${i}`,);
    const menu = build(rows,);
    menu.setHeight(5,);
    for (let i = 0; i < 10; i++) {
      menu.handleInput(DOWN,);
    }

    const shown = menu.render(20,) as string[];
    expect(shown,).toHaveLength(5,);
    expect(stripAnsi(shown.at(-1,)!,),).toContain("> row-10",);
  });

  it("clamps setCursor into range and resets on demand", () => {
    const menu = build(["a", "b",],);
    menu.setCursor(9,);
    expect(menu.getCursor(),).toBe(1,);
    menu.resetCursor();
    expect(menu.getCursor(),).toBe(0,);
  });
});
