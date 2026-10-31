// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Schema-shape tests for the three NSFW route bodies
 * (`src/validation/schemas/nsfw.ts`). The route suites import the route
 * modules, never these symbols directly, so the export-gap ratchet flagged
 * all three — and the stale-gate 422 log (§1 of COVERAGE-GAPS) was exactly
 * missing/unknown keys in these shapes. These tests pin the contract:
 * minimal valid bodies pass, and the 422-class violations fail.
 */
import { describe, expect, test, } from "bun:test";
import { Value, } from "@sinclair/typebox/value";
import {
  NsfwEncounterCreateBody,
  NsfwIntimacyActionBody,
  NsfwSeductionAttemptBody,
} from "./nsfw";

describe("NsfwIntimacyActionBody", () => {
  test("minimal valid body without optional chatId/worldId passes", () => {
    expect(Value.Check(NsfwIntimacyActionBody, {
      actorId: "actor-1",
      targetActorId: "actor-2",
      actionId: "act-1",
      actionName: "Kiss",
      actionType: "physical",
      delta: 5,
    },),).toBe(true,);
  });

  test("missing actorId fails", () => {
    expect(Value.Check(NsfwIntimacyActionBody, {
      targetActorId: "actor-2",
      actionId: "act-1",
      actionName: "Kiss",
      actionType: "physical",
      delta: 5,
    },),).toBe(false,);
  });

  test("unknown actionType fails", () => {
    expect(Value.Check(NsfwIntimacyActionBody, {
      actorId: "actor-1",
      targetActorId: "actor-2",
      actionId: "act-1",
      actionName: "Kiss",
      actionType: "teleport",
      delta: 5,
    },),).toBe(false,);
  });
});

describe("NsfwSeductionAttemptBody", () => {
  test("valid body with skillCategory passes", () => {
    expect(Value.Check(NsfwSeductionAttemptBody, {
      actorId: "actor-1",
      targetId: "actor-2",
      skillCategory: "foreplay",
      approach: "A lingering compliment",
    },),).toBe(true,);
  });

  test("missing skillCategory fails (the stale-log 422)", () => {
    expect(Value.Check(NsfwSeductionAttemptBody, {
      actorId: "actor-1",
      targetId: "actor-2",
      approach: "A lingering compliment",
    },),).toBe(false,);
  });

  test("unknown skillCategory fails", () => {
    expect(Value.Check(NsfwSeductionAttemptBody, {
      actorId: "actor-1",
      targetId: "actor-2",
      skillCategory: "mind_control",
      approach: "A lingering compliment",
    },),).toBe(false,);
  });
});

describe("NsfwEncounterCreateBody", () => {
  test("single-participant body passes", () => {
    expect(Value.Check(NsfwEncounterCreateBody, {
      actorId: "actor-1",
      participants: ["actor-1",],
    },),).toBe(true,);
  });

  test("empty participants array fails", () => {
    expect(Value.Check(NsfwEncounterCreateBody, {
      actorId: "actor-1",
      participants: [],
    },),).toBe(false,);
  });

  test("17-participant array fails the maxItems cap", () => {
    expect(Value.Check(NsfwEncounterCreateBody, {
      actorId: "actor-1",
      participants: Array.from({ length: 17, }, (_, i,) => `actor-${i}`,),
    },),).toBe(false,);
  });

  test("missing actorId fails", () => {
    expect(Value.Check(NsfwEncounterCreateBody, {
      participants: ["actor-1",],
    },),).toBe(false,);
  });
});
