// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * `renderHealthBar` tests on the battle fake DOM: progressbar contract
 * (role/aria attrs), 0–100 clamping of negative / over-max / zero-max inputs,
 * and the `t("battle.health")` default label with override support.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { installBattleDom, } from "../tests/battle-fake-dom";
import { renderHealthBar, } from "./health-bar";

let restoreDom: () => void;

// Sentinel save/restore for the i18n catalog (see tests/i18n.test.ts): wipe
// via `= undefined` would leak into later files in a shared-process serial
// run, so restore whatever catalog was loaded before this file.
const localeStringsHost = globalThis as { __localeStrings?: unknown };
const initialLocaleStrings = localeStringsHost.__localeStrings;
let savedLocaleStrings: unknown;
let hasSavedLocaleStrings = false;

beforeEach(() => {
  restoreDom = installBattleDom();
  savedLocaleStrings = localeStringsHost.__localeStrings;
  hasSavedLocaleStrings = true;
  // Seed the alpine i18n catalog the widget resolves its default label from.
  localeStringsHost.__localeStrings = {
    battle: { health: "Health", },
  };
},);

afterEach(() => {
  if (hasSavedLocaleStrings) {
    localeStringsHost.__localeStrings = savedLocaleStrings;
    hasSavedLocaleStrings = false;
  }

  restoreDom();
},);

afterAll(() => {
  localeStringsHost.__localeStrings = initialLocaleStrings;
},);

describe("renderHealthBar", () => {
  it("renders an accessible progressbar for the clamped percentage", () => {
    const bar = renderHealthBar(25, 30,);
    expect(bar.className,).toBe("battle-hp-bar",);
    expect(bar.getAttribute("role",),).toBe("progressbar",);
    expect(bar.getAttribute("aria-valuenow",),).toBe("83",);
    expect(bar.getAttribute("aria-valuemin",),).toBe("0",);
    expect(bar.getAttribute("aria-valuemax",),).toBe("100",);
    expect(bar.style.width,).toBe("83%",);
  });

  it("clamps negative hp to 0%", () => {
    const bar = renderHealthBar(-5, 30,);
    expect(bar.getAttribute("aria-valuenow",),).toBe("0",);
    expect(bar.style.width,).toBe("0%",);
  });

  it("clamps over-maximum hp to 100%", () => {
    const bar = renderHealthBar(40, 30,);
    expect(bar.getAttribute("aria-valuenow",),).toBe("100",);
    expect(bar.style.width,).toBe("100%",);
  });

  it("clamps a positive-hp / zero-max input to 100% (Math.max guard, no NaN)", () => {
    const bar = renderHealthBar(10, 0,);
    expect(bar.getAttribute("aria-valuenow",),).toBe("100",);
    expect(bar.style.width,).toBe("100%",);
  });

  it("renders 0% for zero hp regardless of max", () => {
    const bar = renderHealthBar(0, 0,);
    expect(bar.getAttribute("aria-valuenow",),).toBe("0",);
    expect(bar.style.width,).toBe("0%",);
  });

  it("labels the bar from the i18n catalog by default", () => {
    expect(renderHealthBar(1, 2,).getAttribute("aria-label",),).toBe("Health",);
  });

  it("falls back to the key when the catalog is empty", () => {
    (globalThis as { __localeStrings?: unknown }).__localeStrings = {};
    expect(renderHealthBar(1, 2,).getAttribute("aria-label",),).toBe("battle.health",);
  });

  it("honors an explicit label override", () => {
    const bar = renderHealthBar(1, 2, { label: "Stamina", },);
    expect(bar.getAttribute("aria-label",),).toBe("Stamina",);
  });
});
