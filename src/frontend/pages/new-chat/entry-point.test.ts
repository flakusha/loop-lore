// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for the new-chat variant picker entry-point branches
 * (epic-chat-product-features, Chat Variants Taxonomy cross-cutting item).
 *
 * Origin surfaces link to `/views/new-chat?variant=<id>`; the page preselects
 * the mapped variant so the existing syncVariantControls behavior (type/mode
 * disabled, world-required RPG) applies from the first render. Unknown or
 * "standard" values fall back to the plain-path default.
 */
import { describe, expect, test, } from "bun:test";
import { readFileSync, } from "node:fs";
import { join, } from "node:path";
import { applyEntryVariant, readEntryVariant, } from "./entry-point";

describe("new-chat entry-point variant mapping", () => {
  test("the plain path and unrelated params preselect nothing", () => {
    expect(readEntryVariant("",),).toBeNull();
    expect(readEntryVariant("?chatid=c1",),).toBeNull();
  });

  test("every taxonomy variant maps from its entry param", () => {
    const variants = [
      "assistant",
      "assistant_group",
      "user_1x1",
      "user_group",
      "user_group_admin",
      "llm_only",
      "llm_only_group",
      "llm_only_group_gm",
      "character",
      "character_group",
      "rpg",
      "rpg_group",
    ];

    for (const variant of variants) {
      expect(readEntryVariant(`?variant=${variant}`,),).toBe(variant,);
    }
  });

  test("standard and unknown params fall back to the plain-path default", () => {
    expect(readEntryVariant("?variant=standard",),).toBeNull();
    expect(readEntryVariant("?variant=made_up",),).toBeNull();
    expect(readEntryVariant("?variant=",),).toBeNull();
  });
});

describe("new-chat entry-point preselection", () => {
  test("preselects the picker with the mapped variant", () => {
    const select = { value: "standard", };
    expect(applyEntryVariant(select, "?variant=character",),).toBe(true,);
    expect(select.value,).toBe("character",);
  });

  test("leaves the picker alone on the plain path", () => {
    const select = { value: "standard", };
    expect(applyEntryVariant(select, "",),).toBe(false,);
    expect(select.value,).toBe("standard",);
  });

  test("tolerates a missing picker", () => {
    expect(applyEntryVariant(null, "?variant=character",),).toBe(false,);
  });
});

describe("Characters tab entry link", () => {
  const templatePath = join(import.meta.dir, "..", "..", "..", "views", "character-chat-list.html",);

  test("preselects the character variant through the entry param", () => {
    const content = readFileSync(templatePath, "utf8",);
    expect(content,).toContain('href="/views/new-chat?variant=character"',);
    expect(content,).toContain('hx-get="/views/new-chat?variant=character"',);
  });

  test("pushes the param URL so the page loader sees it after the htmx swap", () => {
    const content = readFileSync(templatePath, "utf8",);
    expect(content,).toContain('hx-push-url="true"',);
  });
});
