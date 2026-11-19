// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for the new-chat participant picker's actor-kind filter.
 * The helper is pure (no DOM), so these need no harness or module mocks.
 * Resource contract: fixtures are read-only module consts shared by value;
 * no test owns mutable state, globals, ports, or files, and the helper never
 * mutates its input — safe under any parallel/ordering mode.
 */
import { describe, expect, test, } from "bun:test";
import { filterActorsByKind, greetingOptions, } from "./selection";

const alice = { id: "u1", display_name: "Alice", actor_type: "user", agent_type: "none", };
const bob = { id: "c1", display_name: "Bob", actor_type: "character", agent_type: "none", };
const nova = { id: "a1", display_name: "Nova", actor_type: "narrator", agent_type: "ai", };
const mystery = { id: "m1", display_name: "Mystery", };
const wrongCase = { id: "x1", actor_type: "User", agent_type: "AI", };

const actors = [alice, bob, nova, mystery, wrongCase,];
const ids = (rows: { id?: string }[],): (string | undefined)[] => rows.map((a,) => a.id);

describe("filterActorsByKind", () => {
  test("all keeps every row, including ones missing kind fields", () => {
    expect(ids(filterActorsByKind(actors, "all",),),).toEqual(["u1", "c1", "a1", "m1", "x1",],);
  });

  test("user keeps only actor_type === 'user'", () => {
    expect(ids(filterActorsByKind(actors, "user",),),).toEqual(["u1",],);
  });

  test("character keeps only actor_type === 'character'", () => {
    expect(ids(filterActorsByKind(actors, "character",),),).toEqual(["c1",],);
  });

  test("assistant keeps only agent_type === 'ai'", () => {
    expect(ids(filterActorsByKind(actors, "assistant",),),).toEqual(["a1",],);
  });

  test("rows missing the relevant field are excluded from non-all filters", () => {
    expect(ids(filterActorsByKind([mystery,], "user",),),).toEqual([],);
    expect(ids(filterActorsByKind([mystery,], "character",),),).toEqual([],);
    expect(ids(filterActorsByKind([mystery,], "assistant",),),).toEqual([],);
  });

  test("enum values are case-sensitive", () => {
    expect(ids(filterActorsByKind([wrongCase,], "user",),),).toEqual([],);
    expect(ids(filterActorsByKind([wrongCase,], "assistant",),),).toEqual([],);
  });

  test("unknown or missing kind falls back to all", () => {
    expect(filterActorsByKind(actors, "bogus",),).toEqual(actors,);
    expect(filterActorsByKind(actors, "",),).toEqual(actors,);
    expect(filterActorsByKind(actors, undefined as unknown as string,),).toEqual(actors,);
  });
});

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
