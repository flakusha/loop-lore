// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import {
  DEFAULT_TALKATIVITY,
  effectiveTalkativity,
  MAX_TALKATIVITY,
  MIN_TALKATIVITY,
} from "./talkativity";

describe("effectiveTalkativity", () => {
  const actor = { talkativity: 7, };

  test("returns actor baseline when no override or chat value", () => {
    expect(effectiveTalkativity(actor, {}, {},),).toBe(7,);
  });

  test("uses default when actor baseline is missing", () => {
    expect(effectiveTalkativity({ talkativity: undefined as unknown as number, }, {}, {},),).toBe(DEFAULT_TALKATIVITY,);
  });

  test("per-actor override wins above chat and actor baselines", () => {
    expect(
      effectiveTalkativity(actor, { talkativity: 2, }, { override: 9, },),
    ).toBe(9,);
  });

  test("per-chat override wins above actor baseline but loses to per-actor", () => {
    expect(effectiveTalkativity(actor, { talkativity: 3, }, {},),).toBe(3,);
    expect(effectiveTalkativity(actor, { talkativity: 3, }, { override: 0, },),).toBe(0,);
  });

  test("null chat value falls through to actor baseline", () => {
    expect(effectiveTalkativity(actor, { talkativity: null, }, {},),).toBe(7,);
  });

  test("clamps to [MIN, MAX] window", () => {
    expect(effectiveTalkativity({ talkativity: -5, }, {}, {},),).toBe(MIN_TALKATIVITY,);
    expect(effectiveTalkativity({ talkativity: 99, }, {}, {},),).toBe(MAX_TALKATIVITY,);
    expect(effectiveTalkativity(actor, {}, { override: -1, },),).toBe(MIN_TALKATIVITY,);
    expect(effectiveTalkativity(actor, {}, { override: 12, },),).toBe(MAX_TALKATIVITY,);
    expect(effectiveTalkativity(actor, { talkativity: -7, }, {},),).toBe(MIN_TALKATIVITY,);
  });

  test("constants are sane", () => {
    expect(MIN_TALKATIVITY,).toBe(0,);
    expect(MAX_TALKATIVITY,).toBe(10,);
    expect(DEFAULT_TALKATIVITY,).toBe(5,);
  });
});