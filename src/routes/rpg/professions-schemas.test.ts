// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Professions route schema tests.
 *
 * Pins each TypeBox schema in `professions-schemas.ts` directly (accept +
 * shape-violation reject), mirroring the `Value.Check` blocks in
 * `src/routes/gm-notes.test.ts` and `nsfw-moderation/shared.test.ts`.
 */
import { Value, } from "@sinclair/typebox/value";
import { describe, expect, test, } from "bun:test";
import {
  actorIdParams,
  createProfessionBody,
  professionIdParams,
  professionSpecializeBody,
  professionsQuery,
  professionXpBody,
} from "./professions-schemas";

describe("createProfessionBody", () => {
  test("accepts the minimal assign payload", () => {
    expect(Value.Check(createProfessionBody, { actorId: "actor-1", discipline: "alchemy", },),).toBe(true,);
  });

  test("accepts optional worldId and level", () => {
    expect(
      Value.Check(createProfessionBody, { actorId: "a", worldId: "w", discipline: "smithing", level: 30, },),
    ).toBe(true,);
  });

  test("rejects shape violations", () => {
    expect(Value.Check(createProfessionBody, { discipline: "alchemy", },),).toBe(false,);
    expect(Value.Check(createProfessionBody, { actorId: "a", discipline: "sorcery", },),).toBe(false,);
    expect(Value.Check(createProfessionBody, { actorId: "a", discipline: "alchemy", level: 0, },),).toBe(false,);
    expect(Value.Check(createProfessionBody, { actorId: "a", discipline: "alchemy", level: 101, },),).toBe(false,);
  });
});

describe("professionXpBody", () => {
  test("accepts a positive amount", () => {
    expect(Value.Check(professionXpBody, { amount: 50, },),).toBe(true,);
  });

  test("rejects missing, zero, or non-number amounts", () => {
    expect(Value.Check(professionXpBody, {},),).toBe(false,);
    expect(Value.Check(professionXpBody, { amount: 0, },),).toBe(false,);
    expect(Value.Check(professionXpBody, { amount: "50", },),).toBe(false,);
  });
});

describe("professionSpecializeBody", () => {
  const valid = { name: "Rune Weaving", bonusType: "quality", bonusValue: 5, };

  test("accepts the minimal specialize payload", () => {
    expect(Value.Check(professionSpecializeBody, valid,),).toBe(true,);
  });

  test("accepts optional description and requirementLevel", () => {
    expect(
      Value.Check(professionSpecializeBody, { ...valid, description: "d", requirementLevel: 10, },),
    ).toBe(true,);
  });

  test("rejects shape violations", () => {
    expect(Value.Check(professionSpecializeBody, { ...valid, name: "", },),).toBe(false,);
    expect(Value.Check(professionSpecializeBody, { ...valid, bonusType: "luck", },),).toBe(false,);
    expect(Value.Check(professionSpecializeBody, { ...valid, bonusValue: -1, },),).toBe(false,);
    expect(Value.Check(professionSpecializeBody, { bonusType: "quality", bonusValue: 5, },),).toBe(false,);
  });
});

describe("professionIdParams", () => {
  test("accepts an id and rejects a missing one", () => {
    expect(Value.Check(professionIdParams, { id: "prof-1", },),).toBe(true,);
    expect(Value.Check(professionIdParams, {},),).toBe(false,);
  });
});

describe("actorIdParams", () => {
  test("accepts an actorId and rejects a missing one", () => {
    expect(Value.Check(actorIdParams, { actorId: "actor-1", },),).toBe(true,);
    expect(Value.Check(actorIdParams, {},),).toBe(false,);
  });
});

describe("professionsQuery", () => {
  test("accepts empty and world-scoped queries", () => {
    expect(Value.Check(professionsQuery, {},),).toBe(true,);
    expect(Value.Check(professionsQuery, { worldId: "world-1", },),).toBe(true,);
  });

  test("rejects a non-string worldId", () => {
    expect(Value.Check(professionsQuery, { worldId: 42, },),).toBe(false,);
  });
});
