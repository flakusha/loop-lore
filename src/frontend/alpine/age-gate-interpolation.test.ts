// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression: the minimum-age sentence must render a real number.
 *
 * The Alpine `$t` magic (src/frontend/alpine-init.ts:79) is a one-argument
 * lookup that does NOT interpolate. An earlier draft used
 * `$t("ageGate.minimumAge", { age })` in the template, which renders the
 * literal string "You must be at least {age} years old." to the user — no
 * error, no failed test, just wrong output. These assertions pin the rendered
 * text, which is the only place that defect is observable.
 */
import "./i18n.test-helper";
import { beforeEach, expect, mock, test, } from "bun:test";
import { readFileSync, } from "node:fs";
import { join, } from "node:path";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import "./age-gate";

interface AgeGateUnderTest {
  _minimumAge: number;
  minAgeText(): string;
  init(): Promise<void>;
}

let statusResponse: Record<string, unknown> = { isEnabled: true, hasPassed: false, minimumAge: 18, };

if (ISOLATED) {
  mock.module("./htmx", () => ({
    apiFetch: async () => Response.json(statusResponse,),
  }),);
}

function newComponent(): AgeGateUnderTest {
  const factory = (globalThis as unknown as { ageGate: () => AgeGateUnderTest }).ageGate;
  return factory();
}

beforeEach(() => {
  statusResponse = { isEnabled: true, hasPassed: false, minimumAge: 18, };
},);

describeOrSkip("ageGate.minAgeText — renders a real age, not a {age} placeholder", () => {
  test("substitutes the default 18 before any status call", () => {
    expect(newComponent().minAgeText(),).toBe("You must be at least 18 years old.",);
  });

  test("substitutes the age the status endpoint reported", async () => {
    statusResponse = { isEnabled: true, hasPassed: false, minimumAge: 21, };
    const c = newComponent();

    await c.init();

    expect(c.minAgeText(),).toBe("You must be at least 21 years old.",);
  });

  test("never leaks a raw {age} placeholder", async () => {
    statusResponse = { isEnabled: true, hasPassed: false, minimumAge: 25, };
    const c = newComponent();
    await c.init();

    expect(c.minAgeText(),).not.toContain("{age}",);
  });
},);

describeOrSkip("age-gate view — minimum age is bound through minAgeText()", () => {
  const html = readFileSync(join(import.meta.dir, "..", "..", "views", "age-gate.html",), "utf8",);

  test("template calls minAgeText(), not the non-interpolating $t magic", () => {
    expect(html,).toContain('x-text="minAgeText()"',);
    // The only $t uses left are the two zero-parameter button labels.
    expect(html,).not.toContain("$t('ageGate.minimumAge'",);
    expect(html,).not.toContain('$t("ageGate.minimumAge"',);
  });
},);
