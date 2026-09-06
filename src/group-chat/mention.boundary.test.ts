// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
import { describe, expect, test, } from "bun:test";
import { createLogger, } from "../logger";
createLogger();
import { extractMentionedActorIds, parseInitiativeFlag, parseMentions, resolveMention, } from "./index";

describe("group-chat mention boundary", () => {
  test("parseMentions returns empty array on no @", () => {
    const res = parseMentions("hello there",);
    expect(res,).toEqual([],);
  });

  test("parseMentions handles empty string", () => {
    expect(parseMentions("",),).toEqual([],);
  });

  test("parseMentions extracts single @", () => {
    const res = parseMentions("@Luna hello",);
    expect(res.length,).toBe(1,);
    expect(res[0]?.name,).toBe("Luna",);
  });

  test("resolveMention returns null for empty name", () => {
    expect(resolveMention("", [{ actorId: "a", displayName: "Axe", },],),).toBeNull();
  });

  test("resolveMention returns null for non-matching prefix", () => {
    expect(resolveMention("Z", [{ actorId: "a", displayName: "Axe", },],),).toBeNull();
  });

  test("resolveMention picks exact case-insensitive match", () => {
    expect(resolveMention("axe", [{ actorId: "a", displayName: "Axe", },],),).toBe("a",);
  });

  test("resolveMention picks unique prefix deterministically by actorId", () => {
    // "Lu" uniquely matches one participant; deterministic actorId order picks it.
    expect(resolveMention("Lu", [{ actorId: "z", displayName: "Luna", }, { actorId: "a", displayName: "Liam", },],),)
      .toBe("z",);
  });

  test("resolveMention returns null on ambiguous prefix", () => {
    expect(resolveMention("L", [{ actorId: "x", displayName: "Luna", }, { actorId: "y", displayName: "Liam", },],),)
      .toBeNull();
  });

  test("extractMentionedActorIds returns [] on no mentions", () => {
    expect(extractMentionedActorIds("no at here", [{ actorId: "a", displayName: "Axe", },],),).toEqual([],);
  });

  test("extractMentionedActorIds resolves and dedupes", () => {
    const res = extractMentionedActorIds("@Luna @Luna hi", [{ actorId: "L1", displayName: "Luna", },],);
    expect(res,).toEqual(["L1",],);
  });

  test("parseInitiativeFlag strips >>", () => {
    const r = parseInitiativeFlag(">>attack",);
    expect(r.isInitiative,).toBe(true,);
    expect(r.cleanMessage,).toBe("attack",);
  });

  test("parseInitiativeFlag passes through non-initiative", () => {
    const r = parseInitiativeFlag("hello",);
    expect(r.isInitiative,).toBe(false,);
    expect(r.cleanMessage,).toBe("hello",);
  });
});