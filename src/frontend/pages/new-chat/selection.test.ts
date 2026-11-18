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
import { filterActorsByKind, } from "./selection";

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
