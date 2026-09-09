// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { DIALOGUE_TEMPLATES, getDialogueTemplate, listDialogueTemplates, } from "./dialogue-templates";

describe("getDialogueTemplate", () => {
  test("returns the matching built-in dialogue template", () => {
    const template = getDialogueTemplate("narration",);
    expect(template,).not.toBeUndefined();
    expect(template?.id,).toBe("narration",);
    expect(template?.category,).toBe("dialogue",);
  });

  test("returns undefined for unknown id", () => {
    expect(getDialogueTemplate("no-such-dialogue",),).toBeUndefined();
  });
});

describe("listDialogueTemplates", () => {
  test("lists every registered dialogue template", () => {
    expect(listDialogueTemplates().length,).toBe(DIALOGUE_TEMPLATES.length,);
  });

  test("returns a copy — mutating the list does not affect the registry", () => {
    const listed = listDialogueTemplates();
    listed.pop();
    expect(listDialogueTemplates().length,).toBe(DIALOGUE_TEMPLATES.length,);
  });
});

describe("DIALOGUE_TEMPLATES", () => {
  test("template ids are unique", () => {
    const ids = DIALOGUE_TEMPLATES.map((t,) => t.id);
    expect(new Set(ids,).size,).toBe(ids.length,);
  });

  test("every entry is a built-in dialogue-category template", () => {
    for (const template of DIALOGUE_TEMPLATES) {
      expect(template.worldId,).toBe("__builtin__",);
      expect(template.category,).toBe("dialogue",);
      expect(template.body.transition.length,).toBeGreaterThan(0,);
    }
  });
});
