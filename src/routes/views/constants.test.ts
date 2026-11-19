// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { isAbsolute, join, } from "node:path";
import {
  ALLOWED_PARTIALS,
  COMPONENTS_DIR,
  DIST_PUBLIC_DIR,
  I18N_TEMPLATE_RE,
  ICONS_DIR,
  PARTIALS_DIR,
} from "./constants";

describe("view path constants", () => {
  test("point at absolute src and dist directories", () => {
    for (const dir of [COMPONENTS_DIR, DIST_PUBLIC_DIR, ICONS_DIR, PARTIALS_DIR,]) {
      expect(isAbsolute(dir,),).toBe(true,);
    }

    expect(PARTIALS_DIR,).toContain("partials",);
    expect(COMPONENTS_DIR,).toContain("components",);
    expect(DIST_PUBLIC_DIR,).toContain("dist/public",);
    expect(ICONS_DIR,).toBe(join(DIST_PUBLIC_DIR, "icons", "tabler",),);
  });
});

describe("I18N_TEMPLATE_RE", () => {
  test("extracts keys from triple-brace translation calls", () => {
    const source = `{{{ t("chat.title") }}} and {{{t('world.name')}}}`;
    const keys = [...source.matchAll(I18N_TEMPLATE_RE,),].map((match,) => match[1]);
    expect(keys,).toEqual(["chat.title", "world.name",],);
  });

  test("ignores non-translation triple-brace expressions", () => {
    expect("{{{rawHtml}}}".match(I18N_TEMPLATE_RE,),).toBeNull();
  });
});

describe("ALLOWED_PARTIALS", () => {
  test("discovers nested partials from both partials and components roots", () => {
    expect(ALLOWED_PARTIALS instanceof Set,).toBe(true,);
    expect(ALLOWED_PARTIALS.has("characters/create-modal",),).toBe(true,);
    expect(ALLOWED_PARTIALS.has("world-edit/fractal-panel",),).toBe(true,);
  });
});
