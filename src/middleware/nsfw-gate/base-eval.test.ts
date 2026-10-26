// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for src/middleware/nsfw-gate/base-eval.ts — the pure NSFW base-gate
 * evaluator (BUG-two-gates-age-gate-keys).
 *
 * The age verdict must come from the shared `ageGate.*` runtime config via
 * `getStatus` (the same function `checkAgeGate` uses), so:
 *  - a user with `age_gate_accepted_at` set passes both gates regardless of
 *    `nsfw.nsfwMinAge`; a user without it is blocked by both;
 *  - `nsfw.nsfwMinAge` no longer influences age passing at all.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { getRuntimeConfig, initAgeGate, } from "../../age-gate/controller";
import { getStatus, } from "../../age-gate/service";
import { AgeGateMode, } from "../../db/enums";
import { evaluateNsfwBase, type GateInputs, } from "./base-eval";

/** Adult fixture: birth date ~1990, accepted. */
const adult: GateInputs = {
  birthDate: "1990-01-01",
  ageGateAcceptedAt: "2026-01-01T00:00:00Z",
  accessStatus: null,
};

/** Minor fixture: accepted but born 2015. */
const acceptedMinor: GateInputs = {
  birthDate: "2015-01-01",
  ageGateAcceptedAt: "2026-01-01T00:00:00Z",
  accessStatus: null,
};

const neverAccepted: GateInputs = {
  birthDate: "1990-01-01",
  ageGateAcceptedAt: null,
  accessStatus: null,
};

/** Map GateInputs to the snake_case user shape `getStatus` reads. */
function toAgeGateUser(inputs: GateInputs,): { birth_date: string | null; age_gate_accepted_at: string | null } {
  return { birth_date: inputs.birthDate, age_gate_accepted_at: inputs.ageGateAcceptedAt, };
}

describe("evaluateNsfwBase (age verdict delegated to ageGate.*)", () => {
  beforeEach(() => {
    initAgeGate({ enabled: true, minimumAge: 21, mode: AgeGateMode.SelfDeclaration, },);
  },);

  afterEach(() => {
    initAgeGate({ enabled: false, minimumAge: 18, mode: AgeGateMode.None, },);
  },);

  test("accepted adult passes the NSFW gate (nsfw.nsfwMinAge is not consulted)", () => {
    const result = evaluateNsfwBase({ allowNsfw: true, }, adult,);
    expect(result,).toEqual({ allowed: true, },);
  });

  test("minimum age comes from ageGate.minimumAge, not nsfw.nsfwMinAge", () => {
    // Adult of ~36 with ageGate.minimumAge 21 → allowed.
    expect(evaluateNsfwBase({ allowNsfw: true, }, adult,).allowed,).toBe(true,);

    // The SAME user against an age gate that requires 150 → blocked:
    // proves the threshold flows from the ageGate section.
    initAgeGate({ enabled: true, minimumAge: 150, mode: AgeGateMode.SelfDeclaration, },);
    const result = evaluateNsfwBase({ allowNsfw: true, }, adult,);
    expect(result.allowed,).toBe(false,);
  });

  test("user without acceptance is blocked by the NSFW gate AND the age gate", () => {
    const nsfw = evaluateNsfwBase({ allowNsfw: true, }, neverAccepted,);
    expect(nsfw,).toEqual({ allowed: false, reason: "age_gate_not_accepted", },);

    // Same verdict function checkAgeGate uses → identical answer.
    const ageGate = getStatus(initAgeGateStore(), toAgeGateUser(neverAccepted,),);
    expect(ageGate.hasPassed,).toBe(false,);
  });

  test("gate verdicts agree: getStatus is the single source", () => {
    for (const inputs of [adult, acceptedMinor, neverAccepted,]) {
      const nsfw = evaluateNsfwBase({ allowNsfw: true, }, inputs,);
      const ageGate = getStatus(initAgeGateStore(), toAgeGateUser(inputs,),);
      expect(nsfw.allowed,).toBe(ageGate.hasPassed,);
    }
  });

  test("accepted minor is blocked with the underage diagnostic", () => {
    const result = evaluateNsfwBase({ allowNsfw: true, }, acceptedMinor,);
    expect(result.allowed,).toBe(false,);
    expect(result.reason,).toMatch(/^underage:/,);
  });

  test("disabled age gate passes everyone (parity with checkAgeGate no-op)", () => {
    initAgeGate({ enabled: false, minimumAge: 18, mode: AgeGateMode.None, },);
    expect(evaluateNsfwBase({ allowNsfw: true, }, neverAccepted,).allowed,).toBe(true,);
    expect(getStatus(initAgeGateStore(), toAgeGateUser(neverAccepted,),).hasPassed,).toBe(true,);
  });

  test("non-age denials are preserved", () => {
    expect(evaluateNsfwBase({ allowNsfw: false, }, adult,),).toEqual(
      { allowed: false, reason: "nsfw_disabled", },
    );

    expect(evaluateNsfwBase({ allowNsfw: true, }, undefined,),).toEqual(
      { allowed: false, reason: "user_not_found", },
    );

    expect(
      evaluateNsfwBase({ allowNsfw: true, }, { ...adult, accessStatus: "banned", },),
    ).toEqual({ allowed: false, reason: "banned", },);
  });
});

/** Re-read the (possibly re-initialised) runtime age-gate config. */
function initAgeGateStore(): { enabled: boolean; minimumAge: number; mode: AgeGateMode } {
  return getRuntimeConfig();
}
