// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for the new-chat picker's greeting options.
 * The helper is pure (no DOM), so these need no harness or module mocks.
 * Resource contract: fixtures are read-only module consts shared by value;
 * no test owns mutable state, globals, ports, or files, and the helper never
 * mutates its input — safe under any parallel/ordering mode.
 */
import { describe, expect, test, } from "bun:test";
import { greetingOptions, } from "./selection";

describe("greetingOptions", () => {
  const actor = (alternate_greetings: string | null,) => ({ id: "c1", alternate_greetings, });

  test("no selected character hides the picker", () => {
    expect(greetingOptions([],),).toEqual([],);
  });

  test("a character with no greetings hides the picker", () => {
    expect(greetingOptions([actor(null,),],),).toEqual([],);
    expect(greetingOptions([actor("[]",),],),).toEqual([],);
  });

  test("one greeting yields a default option plus the alternate", () => {
    expect(greetingOptions([actor('["Hi!"]',),],),).toEqual([
      { value: "", label: "Default greeting", },
      { value: "0", label: "Alternate greeting 1", },
    ],);
  });

  test("multiple greetings yield one indexed option each", () => {
    expect(greetingOptions([actor('["Hi!","Hello!","Hey!"]',),],),).toEqual([
      { value: "", label: "Default greeting", },
      { value: "0", label: "Alternate greeting 1", },
      { value: "1", label: "Alternate greeting 2", },
      { value: "2", label: "Alternate greeting 3", },
    ],);
  });

  test("multiple selected characters hide the picker", () => {
    expect(greetingOptions([actor('["Hi!"]',), actor('["Hey!"]',),],),).toEqual([],);
  });

  test("switching the selected character rebuilds its options", () => {
    const first = greetingOptions([actor('["Alpha one","Alpha two"]',),],);
    const second = greetingOptions([actor('["Beta only"]',),],);
    expect(first.map((option,) => option.label),).toEqual([
      "Default greeting",
      "Alternate greeting 1",
      "Alternate greeting 2",
    ],);

    expect(second.map((option,) => option.label),).toEqual(["Default greeting", "Alternate greeting 1",],);
  });
});
