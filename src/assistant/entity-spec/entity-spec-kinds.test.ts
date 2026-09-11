// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { creationChatTitle, ENTITY_SPEC_KINDS, findEntitySpec, } from "./entity-spec-kinds";

describe("ENTITY_SPEC_DESCRIPTORS", () => {
  test("every kind maps to its config workflow template", () => {
    expect(findEntitySpec("character",)!.workflowId,).toBe("entity-character",);
    expect(findEntitySpec("location",)!.workflowId,).toBe("entity-location",);
    expect(findEntitySpec("world",)!.workflowId,).toBe("entity-world",);
    expect(findEntitySpec("item",)!.workflowId,).toBe("entity-item",);
  });

  test("registry covers exactly the accepted kind list", () => {
    expect([...ENTITY_SPEC_KINDS,].sort(),).toEqual(["character", "item", "location", "world",],);
  });

  test("unknown kinds resolve to undefined", () => {
    expect(findEntitySpec("npc",),).toBeUndefined();
    expect(findEntitySpec("",),).toBeUndefined();
    expect(findEntitySpec("__proto__",),).toBeUndefined();
  });
});

describe("creationChatTitle", () => {
  test("appends the tentative seed name", () => {
    const descriptor = findEntitySpec("character",)!;
    expect(creationChatTitle(descriptor, "Aldric\nrest of seed",),).toBe("Character creation: Aldric",);
  });

  test("blank seed names fall back to (unnamed)", () => {
    const descriptor = findEntitySpec("item",)!;
    expect(creationChatTitle(descriptor, "  ",),).toBe("Item creation: (unnamed)",);
  });
});
