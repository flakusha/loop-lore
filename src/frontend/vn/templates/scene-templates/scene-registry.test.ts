// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { getSceneTemplate, listSceneTemplates, } from "./scene-registry";
import { SCENE_TEMPLATES, } from "./scene-templates";

describe("getSceneTemplate", () => {
  test("returns the matching built-in scene template", () => {
    const template = getSceneTemplate("introduction",);
    expect(template,).not.toBeUndefined();
    expect(template?.id,).toBe("introduction",);
    expect(template?.name,).toBe("Introduction",);
    expect(template?.category,).toBe("scene",);
  });

  test("returns undefined for unknown id", () => {
    expect(getSceneTemplate("no-such-scene",),).toBeUndefined();
  });
});

describe("listSceneTemplates", () => {
  test("lists every registered scene template", () => {
    expect(listSceneTemplates().length,).toBe(SCENE_TEMPLATES.length,);
    expect(listSceneTemplates().map((t,) => t.id),).toEqual(SCENE_TEMPLATES.map((t,) => t.id),);
  });

  test("returns a copy — mutating the list does not affect the registry", () => {
    const listed = listSceneTemplates();
    listed.pop();
    expect(listSceneTemplates().length,).toBe(SCENE_TEMPLATES.length,);
  });
});
