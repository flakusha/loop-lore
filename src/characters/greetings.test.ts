// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { parseAlternateGreetings, resolveGreeting, } from "./greetings";

describe("parseAlternateGreetings", () => {
  test("no greetings: null, empty and malformed values yield []", () => {
    expect(parseAlternateGreetings(null,),).toEqual([],);
    expect(parseAlternateGreetings(undefined,),).toEqual([],);
    expect(parseAlternateGreetings("",),).toEqual([],);
    expect(parseAlternateGreetings("[]",),).toEqual([],);
    expect(parseAlternateGreetings("not json",),).toEqual([],);
    expect(parseAlternateGreetings('{"a":1}',),).toEqual([],);
  });

  test("one greeting is parsed from the stored JSON string", () => {
    expect(parseAlternateGreetings('["Hi!"]',),).toEqual(["Hi!",],);
  });

  test("multiple greetings keep their stored order", () => {
    expect(parseAlternateGreetings('["Hi!","Hello!","Hey!"]',),).toEqual(["Hi!", "Hello!", "Hey!",],);
  });

  test("an already-parsed array is accepted and blank entries are dropped", () => {
    expect(parseAlternateGreetings(["Hi!", "  ", "Hello!",],),).toEqual(["Hi!", "Hello!",],);
  });
});

describe("resolveGreeting", () => {
  const raw = '["Hi!","Hello!"]';

  test("no selection falls back to the primary welcome message", () => {
    expect(resolveGreeting(raw, "Primary",),).toBe("Primary",);
    expect(resolveGreeting(null, "Primary",),).toBe("Primary",);
  });

  test("an in-range index selects the matching alternate", () => {
    expect(resolveGreeting(raw, "Primary", 0,),).toBe("Hi!",);
    expect(resolveGreeting(raw, "Primary", 1,),).toBe("Hello!",);
  });

  test("out-of-range, negative and fractional indexes fall back to primary", () => {
    expect(resolveGreeting(raw, "Primary", 2,),).toBe("Primary",);
    expect(resolveGreeting(raw, "Primary", -1,),).toBe("Primary",);
    expect(resolveGreeting(raw, "Primary", 0.5,),).toBe("Primary",);
  });

  test("a character with no alternates always uses primary", () => {
    expect(resolveGreeting(null, "Primary", 0,),).toBe("Primary",);
    expect(resolveGreeting("[]", "Primary", 0,),).toBe("Primary",);
  });
});
