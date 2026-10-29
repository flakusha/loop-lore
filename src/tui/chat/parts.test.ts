// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the two pi-tui adapter parts of the chat widget: the input field's
 * change hook and the transcript pane's follow-tail scrolling.
 */
import { describe, expect, it, } from "bun:test";
import { stripRows, } from "../test-support";
import { API_BASE, } from "./api";
import { ChatInputField, } from "./input-field";
import { TranscriptPane, } from "./transcript";

describe("ChatInputField", () => {
  it("fires the change hook on every applied keystroke", () => {
    const field = new ChatInputField();
    let changes = 0;
    field.onChange = () => {
      changes++;
    };

    expect(field.handleInput("h",),).toBe(true,);
    expect(field.handleInput("i",),).toBe(true,);
    expect(changes,).toBe(2,);
    expect(field.getValue(),).toBe("hi",);
  });

  it("does not fire when the key is not consumed", () => {
    const field = new ChatInputField();
    let changes = 0;
    field.onChange = () => {
      changes++;
    };

    field.handleInput("\x1b",); // escape is not an edit
    expect(changes,).toBe(0,);
  });
});

describe("TranscriptPane", () => {
  function paneWith(count: number,): { pane: TranscriptPane; rows: string[] } {
    const rows = Array.from({ length: count, }, (_, i,) => `line ${i}`,);
    const pane = new TranscriptPane();
    pane.scroll.setLines(rows,);
    pane.setHeight(3,);
    return { pane, rows, };
  }

  it("follows the tail: the newest rows are visible without scrolling", () => {
    const { pane, rows, } = paneWith(20,);
    const shown = stripRows(pane.render(30,),);
    expect(shown.some((row,) => row.includes(rows.at(-1,)!,)),).toBe(true,);
    expect(shown.some((row,) => row.includes(rows[0]!,)),).toBe(false,);
  });

  it("arrow-up scrolls away from the tail; End jumps back", () => {
    const { pane, rows, } = paneWith(20,);
    pane.handleInput("\x1b[A",); // up
    pane.handleInput("\x1b[A",);
    const up = stripRows(pane.render(30,),);
    expect(up.some((row,) => row.includes(rows.at(-1,)!,)),).toBe(false,);

    pane.handleInput("\x1b[F",); // end
    const back = stripRows(pane.render(30,),);
    expect(back.some((row,) => row.includes(rows.at(-1,)!,)),).toBe(true,);
  });

  it("page-up jumps a viewport at a time", () => {
    const { pane, rows, } = paneWith(50,);
    pane.handleInput("\x1b[5~",); // pageUp
    const shown = stripRows(pane.render(30,),);
    expect(shown.some((row,) => row.includes(rows.at(-1,)!,)),).toBe(false,);
  });
});

describe("API_BASE", () => {
  it("defaults to the local loop-lore server", () => {
    expect(API_BASE,).toContain("http://",);
    expect(API_BASE,).not.toContain(" ",);
  });
});
