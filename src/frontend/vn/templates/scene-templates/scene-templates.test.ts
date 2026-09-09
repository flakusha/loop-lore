// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { SCENE_TEMPLATES, } from "./scene-templates";

describe("SCENE_TEMPLATES", () => {
  test("template ids are unique", () => {
    const ids = SCENE_TEMPLATES.map((t,) => t.id);
    expect(new Set(ids,).size,).toBe(ids.length,);
  });

  test("every entry is a built-in scene-category template", () => {
    for (const template of SCENE_TEMPLATES) {
      expect(template.worldId,).toBe("__builtin__",);
      expect(template.category,).toBe("scene",);
      expect(template.name.length,).toBeGreaterThan(0,);
      expect(template.version,).toBeGreaterThan(0,);
    }
  });

  test("every body carries layout and transition", () => {
    for (const template of SCENE_TEMPLATES) {
      expect(template.body.layout,).not.toBe("inherit",);
      expect(template.body.transition.length,).toBeGreaterThan(0,);
    }
  });

  test("variable defaults stay inside the declared enum", () => {
    for (const template of SCENE_TEMPLATES) {
      for (const variable of template.variables) {
        if (variable.type === "enum" && variable.default !== undefined) {
          expect(variable.enum ?? [],).toContain(variable.default as string,);
        }
      }
    }
  });

  test("includes the anchor scenes GM flows rely on", () => {
    const ids = new Set(SCENE_TEMPLATES.map((t,) => t.id),);
    for (const id of ["introduction", "confrontation", "resolution", "farewell", "combat_start",]) {
      expect(ids.has(id,),).toBe(true,);
    }
  });
});
