// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Schema-shape tests for the NSFW route bodies
 * (`src/validation/schemas/nsfw.ts`). The route suites import the route
 * modules, never these symbols directly, so the export-gap ratchet flagged
 * them — and the stale-gate 422 log (§1 of COVERAGE-GAPS) was exactly
 * missing/unknown keys in these shapes. These tests pin the contract:
 * minimal valid bodies pass, and the 422-class violations fail.
 *
 * `chatId` is REQUIRED on the three chat-scoped write DTOs: the consent
 * stage is per-(user, chat), so an omitted chat id would skip the gate
 * entirely. The omission is rejected at the boundary (422) instead.
 */
import { describe, expect, test, } from "bun:test";
import { Value, } from "@sinclair/typebox/value";
import {
  NsfwConsentBody,
  NsfwEncounterCreateBody,
  NsfwIntimacyActionBody,
  NsfwSeductionAttemptBody,
} from "./nsfw";

describe("NsfwIntimacyActionBody", () => {
  test("minimal valid body without optional worldId passes", () => {
    expect(Value.Check(NsfwIntimacyActionBody, {
      chatId: "chat-1",
      actorId: "actor-1",
      targetActorId: "actor-2",
      actionId: "act-1",
      actionName: "Kiss",
      actionType: "physical",
      delta: 5,
    },),).toBe(true,);
  });

  test("missing chatId fails (the consent-stage bypass)", () => {
    expect(Value.Check(NsfwIntimacyActionBody, {
      actorId: "actor-1",
      targetActorId: "actor-2",
      actionId: "act-1",
      actionName: "Kiss",
      actionType: "physical",
      delta: 5,
    },),).toBe(false,);
  });

  test("missing actorId fails", () => {
    expect(Value.Check(NsfwIntimacyActionBody, {
      chatId: "chat-1",
      targetActorId: "actor-2",
      actionId: "act-1",
      actionName: "Kiss",
      actionType: "physical",
      delta: 5,
    },),).toBe(false,);
  });

  test("unknown actionType fails", () => {
    expect(Value.Check(NsfwIntimacyActionBody, {
      chatId: "chat-1",
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
      chatId: "chat-1",
      actorId: "actor-1",
      targetId: "actor-2",
      skillCategory: "foreplay",
      approach: "A lingering compliment",
    },),).toBe(true,);
  });

  test("missing chatId fails (the consent-stage bypass)", () => {
    expect(Value.Check(NsfwSeductionAttemptBody, {
      actorId: "actor-1",
      targetId: "actor-2",
      skillCategory: "foreplay",
      approach: "A lingering compliment",
    },),).toBe(false,);
  });

  test("missing skillCategory fails (the stale-log 422)", () => {
    expect(Value.Check(NsfwSeductionAttemptBody, {
      chatId: "chat-1",
      actorId: "actor-1",
      targetId: "actor-2",
      approach: "A lingering compliment",
    },),).toBe(false,);
  });

  test("unknown skillCategory fails", () => {
    expect(Value.Check(NsfwSeductionAttemptBody, {
      chatId: "chat-1",
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
      chatId: "chat-1",
      actorId: "actor-1",
      participants: ["actor-1",],
    },),).toBe(true,);
  });

  test("missing chatId fails (the consent-stage bypass)", () => {
    expect(Value.Check(NsfwEncounterCreateBody, {
      actorId: "actor-1",
      participants: ["actor-1",],
    },),).toBe(false,);
  });

  test("empty participants array fails", () => {
    expect(Value.Check(NsfwEncounterCreateBody, {
      chatId: "chat-1",
      actorId: "actor-1",
      participants: [],
    },),).toBe(false,);
  });

  test("17-participant array fails the maxItems cap", () => {
    expect(Value.Check(NsfwEncounterCreateBody, {
      chatId: "chat-1",
      actorId: "actor-1",
      participants: Array.from({ length: 17, }, (_, i,) => `actor-${i}`,),
    },),).toBe(false,);
  });

  test("missing actorId fails", () => {
    expect(Value.Check(NsfwEncounterCreateBody, {
      chatId: "chat-1",
      participants: ["actor-1",],
    },),).toBe(false,);
  });
});

describe("NsfwConsentBody", () => {
  test("valid `given` body passes", () => {
    expect(Value.Check(NsfwConsentBody, {
      chatId: "chat-1",
      action: "given",
    },),).toBe(true,);
  });

  test("valid `revoked` body with scope and reason passes", () => {
    expect(Value.Check(NsfwConsentBody, {
      chatId: "chat-1",
      action: "revoked",
      scope: "nsfw_encounter",
      reason: "no longer wanted",
    },),).toBe(true,);
  });

  test("a client-supplied userId fails (the DTO is closed)", () => {
    expect(Value.Check(NsfwConsentBody, {
      chatId: "chat-1",
      action: "given",
      userId: "someone-else",
    },),).toBe(false,);
  });

  test("missing chatId fails", () => {
    expect(Value.Check(NsfwConsentBody, {
      action: "given",
    },),).toBe(false,);
  });

  test("an unknown action fails", () => {
    expect(Value.Check(NsfwConsentBody, {
      chatId: "chat-1",
      action: "toggle",
    },),).toBe(false,);
  });


  test("missing action fails (a plain union, not a union enum)", () => {
    expect(Value.Check(NsfwConsentBody, {
      chatId: "chat-1",
    },),).toBe(false,);
  });
});
