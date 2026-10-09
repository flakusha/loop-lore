// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Pins the AC2 invariant of `TASK-tui-shell-testability`: importing any
 * module under `src/tui/` constructs ZERO blessed objects. A module-scope
 * `blessed.screen()` blocks on terminal events outside a TTY and takes every
 * suite that imports the module down with it, so this guards a real
 * breakage, not a style rule.
 *
 * The module list is read off disk rather than hard-coded: a module added
 * later is covered by this sweep the moment it lands, which is the point.
 * The specifiers are therefore runtime-selected — a static import per
 * module would have to be written twice and would rot silently.
 *
 * `blessed` is stubbed by `mock.module` for the same reason `app.test.ts`
 * and `chat/index.test.ts` stub it: the real module opens a terminal. The
 * stub is the counting form of theirs — every factory it names bumps one
 * counter, and a factory it does NOT name throws on use, so a new blessed
 * call site at module scope fails the sweep loudly instead of slipping past
 * an unlisted name.
 */
import { expect, it, mock, } from "bun:test";
import { readdirSync, } from "node:fs";
import { describeOrSkip, ISOLATED, } from "../test-utils/isolate-only";

/** Blessed factory calls since the last reset — zero is the contract. */
let constructions = 0;

const widget = (): Record<string, unknown> => ({
  append: () => {},
  destroy: () => {},
  focused: null,
  render: () => {},
  setContent: () => {},
});

const count = (): Record<string, unknown> => {
  constructions++;
  return widget();
};

const blessedStub = {
  box: count,
  list: count,
  screen: count,
  text: count,
  textbox: count,
};

if (ISOLATED) {
  mock.module("blessed", () => ({ default: blessedStub, ...blessedStub, }),);
}

/** Every non-test module under `src/tui/`, as `./`-relative specifiers. */
const tuiModules = readdirSync(import.meta.dir, { recursive: true, },)
  .filter((name,): name is string =>
    typeof name === "string" &&
    name.endsWith(".ts",) &&
    !name.endsWith(".test.ts",) &&
    !name.endsWith(".d.ts",)
  )
  .map((name,) => `./${name}`);

describeOrSkip("tui import purity", () => {
  it("discovers every module under src/tui/", () => {
    // A sweep that silently matched nothing would pass forever.
    expect(tuiModules.length,).toBeGreaterThanOrEqual(11,);
  });

  for (const specifier of tuiModules) {
    it(`${specifier} constructs nothing at import time`, async () => {
      constructions = 0;
      await import(specifier);
      expect(constructions,).toBe(0,);
    });
  }
},);
