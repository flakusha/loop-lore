// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for the shared modality-template machinery (FEAT-065):
 * profile matching precedence and `{{variable}}` substitution.
 */
import { describe, expect, test, } from "bun:test";
import { matchModalityProfile, resolveModalityTemplate, } from "./shared";

interface FakeProfile {
  id: string;
}

const REGISTRY = {
  profiles: {
    alpha: { id: "alpha", } as FakeProfile,
    beta: { id: "beta", } as FakeProfile,
  },
  defaultProfileId: "beta",
  modelMatching: [
    { pattern: "first", profileId: "alpha", },
    { pattern: "second", profileId: "beta", },
  ],
};

describe("matchModalityProfile", () => {
  test("explicit profileId wins over modelName matching", () => {
    const profile = matchModalityProfile(REGISTRY, { profileId: "alpha", modelName: "second-model", },);
    expect(profile.id,).toBe("alpha",);
  });

  test("modelName pattern matches case-insensitively, first match wins", () => {
    expect(matchModalityProfile(REGISTRY, { modelName: "A-FIRST-Model", },).id,).toBe("alpha",);
    expect(matchModalityProfile(REGISTRY, { modelName: "x-second-y", },).id,).toBe("beta",);
  });

  test("unknown modelName falls through to the default profile", () => {
    expect(matchModalityProfile(REGISTRY, { modelName: "mystery", },).id,).toBe("beta",);
  });

  test("unknown explicit profileId falls through to the default profile", () => {
    expect(matchModalityProfile(REGISTRY, { profileId: "ghost", },).id,).toBe("beta",);
  });

  test("no options resolves the default profile", () => {
    expect(matchModalityProfile(REGISTRY, {},).id,).toBe("beta",);
  });
});

describe("resolveModalityTemplate", () => {
  test("substitutes every provided variable", () => {
    const out = resolveModalityTemplate("{{a}} then {{b}}", { a: "one", b: "two", },);
    expect(out,).toBe("one then two",);
  });

  test("repeated tokens are all replaced", () => {
    const out = resolveModalityTemplate("{{x}} {{x}} {{x}}", { x: "y", },);
    expect(out,).toBe("y y y",);
  });

  test("unknown tokens are left verbatim (applySimpleTemplate contract)", () => {
    const out = resolveModalityTemplate("known {{a}}, unknown {{nope}}", { a: "1", },);
    expect(out,).toBe("known 1, unknown {{nope}}",);
  });

  test("empty vars map leaves the body untouched", () => {
    expect(resolveModalityTemplate("{{a}}", {},),).toBe("{{a}}",);
  });

  test("replacement values with $ patterns are not re-interpreted", () => {
    const out = resolveModalityTemplate("{{a}}", { a: "$&$`$'", },);
    expect(out,).toBe("$&$`$'",);
  });
});
