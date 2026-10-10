// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the shared `emotions` array validation used by the batch and
 * regenerate endpoints — the acceptance/validity/duplicate rules and the exact
 * 400 payload each failing rule produces.
 */
import { describe, expect, test, } from "bun:test";
import { EmotionType, } from "../../db/enums";
import { ErrorCode, } from "../http-utils";
import { validateEmotionsParam, } from "./emotion-request";

const ALL = Object.values(EmotionType,);

/** Read the error body a rejection Response carries (`jsonError` shape). */
async function body(res: Response,): Promise<{ error: string; code: string }> {
  return await res.json() as { error: string; code: string };
}

/** Assert a rejection carries the given 400 message, and return nothing. */
async function expectRejection(emotions: string[], message: string,): Promise<void> {
  const res = validateEmotionsParam(emotions,);
  expect(res,).toBeInstanceOf(Response,);
  expect(res?.status,).toBe(400,);
  const parsed = await body(res!,);
  expect(parsed.code,).toBe(ErrorCode.BadRequest,);
  expect(parsed.error,).toBe(message,);
}

describe("validateEmotionsParam", () => {
  test("absent or empty array passes without validating", () => {
    expect(validateEmotionsParam(undefined,),).toBeNull();
    expect(validateEmotionsParam([],),).toBeNull();
  });

  test("a subset of known emotions passes", () => {
    expect(validateEmotionsParam(["happy", "sad",],),).toBeNull();
    expect(validateEmotionsParam(ALL,),).toBeNull();
  });

  test("an unknown emotion is rejected with its own name in the message", async () => {
    await expectRejection(["happy", "elated",], "Invalid emotion: elated",);
  });

  test("an unknown entry beyond the cap is reported as a cap violation", async () => {
    // Cap is checked first: a full-length array plus one bogus entry trips the
    // cap, not the validity loop.
    await expectRejection([...ALL, "elated",], `emotions accepts at most ${ALL.length} entries`,);
  });

  test("more entries than there are emotions is rejected by the fan-out cap", async () => {
    await expectRejection([...ALL, ALL[0]!,], `emotions accepts at most ${ALL.length} entries`,);
  });

  test("duplicate emotions are rejected even though every entry is known", async () => {
    await expectRejection(["happy", "sad", "happy",], "emotions must not contain duplicates",);
  });

  test("cap is checked before validity, validity before duplicates", async () => {
    // "nope" is unknown AND duplicated — validity wins because it runs first.
    await expectRejection(["nope", "nope",], "Invalid emotion: nope",);
    // Duplicated but valid entries get past the validity loop to the dup check.
    await expectRejection([ALL[0]!, ALL[0]!,], "emotions must not contain duplicates",);
  });
});
