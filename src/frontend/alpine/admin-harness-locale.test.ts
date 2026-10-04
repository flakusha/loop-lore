// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Locale parity for the Harness admin tab.
 *
 * A missing key renders as the raw dotted key on the page, so every
 * `harness.*` key in `en.json` (the source of truth) must exist in every
 * other locale file - and no locale may invent a key the others lack.
 */
import { describe, expect, test, } from "bun:test";
import { readdirSync, readFileSync, } from "node:fs";
import { join, } from "node:path";

const LOCALES_DIR = join(import.meta.dir, "../../public/locales",);

/** Dotted leaf keys of an object, e.g. `harness.column.model`. */
function leafKeys(node: unknown, prefix: string = "",): string[] {
  if (typeof node !== "object" || node === null) { return [prefix,]; }
  return Object.entries(node,).flatMap(([key, value,],) => leafKeys(value, prefix === "" ? key : `${prefix}.${key}`,));
}

/** Every locale file name, sorted so failures are stable. */
function localeFiles(): string[] {
  return readdirSync(LOCALES_DIR,)
    .filter((name,) => name.endsWith(".json",))
    .sort();
}

const locales = new Map(
  localeFiles().map((name,) => {
    const parsed: unknown = JSON.parse(readFileSync(join(LOCALES_DIR, name,), "utf8",),);
    return [name.replace(/\.json$/, "",), parsed,];
  },),
);

const enKeys = new Set(leafKeys(locales.get("en",), "",),);
const harnessKeys = [...enKeys,].filter((key,) => key.startsWith("harness.",)).sort();

describe("harness locale parity", () => {
  test("en.json declares the harness namespace", () => {
    expect(harnessKeys.length,).toBeGreaterThan(30,);
    expect(harnessKeys,).toContain("harness.tabLabel",);
    expect(harnessKeys,).toContain("harness.errorForbidden",);
  });

  for (const [locale, data,] of locales) {
    test(`${locale}.json has every harness.* key`, () => {
      const missing = harnessKeys.filter((key,) => !leafKeys(data, "",).includes(key,));
      expect(missing,).toEqual([],);
    });

    test(`${locale}.json has no harness.* key en.json lacks`, () => {
      const extra = leafKeys(data, "",).filter(
        (key,) => key.startsWith("harness.",) && !enKeys.has(key,),
      );

      expect(extra,).toEqual([],);
    });

    test(`${locale}.json has no empty harness translation`, () => {
      const path = (key: string,): string[] => key.split(".",);
      const empty = harnessKeys.filter((key,) => {
        const node = path(key,).reduce<unknown>(
          (acc, part,) =>
            typeof acc === "object" && acc !== null
              ? (acc as Record<string, unknown>)[part]
              : undefined,
          data,
        );

        return typeof node !== "string" || node.trim() === "";
      },);

      expect(empty,).toEqual([],);
    });
  }
});
