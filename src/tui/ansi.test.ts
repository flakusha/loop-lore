// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * tagsToAnsi: the render-boundary converter for the blessed-tagged strings the
 * display formatters emit. Pure string work — no terminal needed.
 */
import { describe, expect, it, } from "bun:test";
import { tagsToAnsi, } from "./ansi";

describe("tagsToAnsi", () => {
  it("converts bold and italic", () => {
    expect(tagsToAnsi("{bold}hi{/bold}",),).toBe("\x1b[1mhi\x1b[22m",);
    expect(tagsToAnsi("{italic}x{/italic}",),).toBe("\x1b[3mx\x1b[23m",);
  });

  it("converts every foreground color in use", () => {
    expect(tagsToAnsi("{red-fg}e{/red-fg}",),).toBe("\x1b[31me\x1b[39m",);
    expect(tagsToAnsi("{green-fg}o{/green-fg}",),).toBe("\x1b[32mo\x1b[39m",);
    expect(tagsToAnsi("{yellow-fg}w{/yellow-fg}",),).toBe("\x1b[33mw\x1b[39m",);
    expect(tagsToAnsi("{blue-fg}b{/blue-fg}",),).toBe("\x1b[34mb\x1b[39m",);
    expect(tagsToAnsi("{cyan-fg}c{/cyan-fg}",),).toBe("\x1b[36mc\x1b[39m",);
    expect(tagsToAnsi("{gray}g{/gray}",),).toBe("\x1b[90mg\x1b[39m",);
    expect(tagsToAnsi("{gray-fg}g{/gray-fg}",),).toBe("\x1b[90mg\x1b[39m",);
  });

  it("maps the picker's compound bold-fg3 tag", () => {
    expect(tagsToAnsi("{bold-fg3}[pinned]{/bold-fg3}",),)
      .toBe("\x1b[1m\x1b[33m[pinned]\x1b[22m\x1b[39m",);
  });

  it("unescapes {open}/{close} back to literal braces", () => {
    expect(tagsToAnsi("{open}bold{close}",),).toBe("{bold}",);
    expect(tagsToAnsi("a {close} b",),).toBe("a } b",);
  });

  it("leaves closed {open}/{close} markers untouched", () => {
    expect(tagsToAnsi("{/open}",),).toBe("{/open}",);
    expect(tagsToAnsi("{/close}",),).toBe("{/close}",);
  });

  it("strips unknown tags like blessed's parser", () => {
    expect(tagsToAnsi("{nope}x{/nope}",),).toBe("x",);
  });

  it("renders escaped untrusted tag text literally, without ANSI", () => {
    const escaped = "{open}red-fg{close}injected{open}/red-fg{close}";
    expect(tagsToAnsi(escaped,),).toBe("{red-fg}injected{/red-fg}",);
  });
});
