/**
 * Tests for the age-gate view wiring — auto-discovery, template hooks, and
 * locale parity. The controller contract itself is covered in src/age-gate/.
 */
import { describe, expect, test, } from "bun:test";
import { readdirSync, readFileSync, } from "node:fs";
import { join, } from "node:path";
import { ALLOWED_VIEWS, } from "./constants";
import { serveView, } from "./index";
import { applyI18n, loadView, } from "./layout";

const LOCALES_DIR = join(import.meta.dir, "..", "..", "public", "locales",);

/** Dotted leaf keys of a locale object. */
function leafKeys(node: unknown, prefix = "",): string[] {
  if (typeof node !== "object" || node === null) { return [prefix,]; }
  return Object.entries(node,).flatMap(([key, value,],) => leafKeys(value, prefix === "" ? key : `${prefix}.${key}`,));
}

/** Every locale's parsed content, sorted by file name so failures are stable. */
const locales: [string, Record<string, unknown>,][] = readdirSync(LOCALES_DIR,)
  .filter((name,) => name.endsWith(".json",))
  .sort()
  .map((name,) => [
    name.replace(/\.json$/, "",),
    JSON.parse(readFileSync(join(LOCALES_DIR, name,), "utf8",),) as Record<string, unknown>,
  ]);

describe("views/age-gate — discovery and serving", () => {
  test("is an allowed view via auto-discovery (no registry edit needed)", () => {
    expect(ALLOWED_VIEWS.has("age-gate",),).toBe(true,);
  });

  test("serves the form wired to the component and the accept endpoint", async () => {
    const res = serveView("age-gate", true,);
    expect(res,).not.toBeNull();
    const html = await res!.text();

    // Client state must be the registered Alpine component.
    expect(html,).toContain('x-data="ageGate()"',);
    // The form's no-JS fallback action must match the mounted route prefix.
    expect(html,).toContain('action="/api/v1/age-gate/accept"',);
    // Field name is what handleAccept reads: body.birthDate.
    expect(html,).toContain('name="birthDate"',);
    expect(html,).toContain('x-on:submit.prevent="submit()"',);
  });

  test("submit stays disabled until the date and consent are both present", async () => {
    const html = await serveView("age-gate", true,)!.text();
    expect(html,).toContain('x-bind:disabled="_submitting || !canSubmit()"',);
    expect(html,).toContain('x-model="_consent"',);
  });

  test("renders the error slot and the data-handling note", async () => {
    const html = await serveView("age-gate", true,)!.text();
    expect(html,).toContain('data-testid="age-gate-error"',);
    expect(html,).toContain('data-testid="age-gate-data-note"',);
  });

  test("every ageGate.* key resolves through the i18n template", () => {
    const html = applyI18n(loadView("age-gate",), (key,) => `T:${key}`,);
    // No raw {{{t(...)}}} directive may survive translation, and no key may
    // reach the page unresolved.
    expect(html,).not.toContain("{{{t(",);
    expect(html,).toContain("T:ageGate.heading",);
    expect(html,).toContain("T:ageGate.consent",);
  });
});

describe("views/age-gate — locale parity", () => {
  const enKeys = new Set(leafKeys(locales[0]?.[1], "",),);
  const ageGateKeys = [...enKeys,].filter((key,) => key.startsWith("ageGate.",)).sort();

  test("en.json declares the keys the view and component reference", () => {
    expect(ageGateKeys,).toContain("ageGate.heading",);
    expect(ageGateKeys,).toContain("ageGate.minimumAge",);
    expect(ageGateKeys,).toContain("ageGate.errorUnderage",);
    expect(ageGateKeys,).toContain("ageGate.errorInvalidDate",);
    expect(ageGateKeys,).toContain("ageGate.errorGeneric",);
  });

  test("minimumAge interpolates the age the status endpoint reported", () => {
    const en = locales[0]?.[1] as { ageGate?: { minimumAge?: unknown } };
    expect(en.ageGate?.minimumAge,).toContain("{age}",);
  });

  for (const [locale, data,] of locales) {
    test(`${locale}.json has every ageGate.* key and invents none`, () => {
      const keys = leafKeys(data, "",);
      expect(ageGateKeys.filter((key,) => !keys.includes(key,)),).toEqual([],);
      expect(keys.filter((key,) => key.startsWith("ageGate.",) && !enKeys.has(key,)),).toEqual([],);
    });
  }
});
