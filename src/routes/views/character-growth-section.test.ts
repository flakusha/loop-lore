// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Growth section + edit-section constant tests (split from character-edit-form.ts).
 *
 * growthSection is pure HTML; the escapeAttr seam mirrors the form builder's
 * (escapeHtml plus single-quote encoding for quoted attributes).
 */
import { describe, expect, test, } from "bun:test";

import { INTERNAL_TRAITS_SECTION, PROACTIVE_SECTION, } from "./character-edit-sections";
import { growthSection, type GrowthSectionValues, } from "./character-growth-section";
import { escapeHtml, } from "./escape-html";

function escapeAttr(str: string,): string {
  return escapeHtml(str,).replaceAll("'", "&#39;",);
}

const BASE: GrowthSectionValues = {
  arcDescription: "",
  arcStage: "introduction",
  characterId: "actor-aria",
  dataVersion: 4,
  growthMode: "dynamic",
  llmAssistEnabled: false,
  recentEntries: [],
};

describe("growthSection", () => {
  test("renders the editor seed with the selected stage", () => {
    const html = growthSection(
      { ...BASE, arcDescription: "The fall", arcStage: "crisis", growthMode: "static", },
      escapeAttr,
    );

    expect(html,).toContain('data-testid="character-growth-section"',);
    expect(html,).toContain("characterGrowthEditor({",);
    expect(html,).toContain("initialMode: 'static'",);
    expect(html,).toContain('<option value="crisis" selected>',);
    expect(html,).toContain("The fall",);
    expect(html,).toContain("dataVersion: 4",);
  });

  test("renders recent entries", () => {
    const html = growthSection(
      {
        ...BASE,
        recentEntries: [
          { axis: "trait", reason: "Stood firm", recordedAt: "today", },
          { axis: "skill", reason: "Learned fast", recordedAt: "yesterday", },
        ],
      },
      escapeAttr,
    );

    expect(html,).toContain("Stood firm",);
    expect(html,).toContain("Learned fast",);
    expect(html,).toContain("growth-recent-entry",);
  });

  test("empty entries show the empty state", () => {
    const html = growthSection(BASE, escapeAttr,);

    expect(html,).toContain("No growth recorded yet.",);
  });

  test("arc descriptions with quotes and newlines stay valid editor seeds", () => {
    const html = growthSection(
      { ...BASE, arcDescription: "hero's fall\nand rise <b>bold</b>", },
      escapeAttr,
    );

    // JSON-encoded seed: double-quoted, newline escaped, markup entity-encoded.
    expect(html,).toContain("initialArcDescription: &quot;hero&#39;s fall\\nand rise &lt;b&gt;bold&lt;/b&gt;&quot;",);
    expect(html,).not.toContain("'hero",);
  });

  test("escapes the character id for quoted attributes", () => {
    const html = growthSection({ ...BASE, characterId: "evil'); alert(1); ('", }, escapeAttr,);

    expect(html,).toContain("evil&#39;); alert(1); (&#39;",);
    expect(html,).not.toContain("evil'); alert(1); ('",);
  });
});

describe("character-edit-sections", () => {
  test("internal traits section carries its mount points", () => {
    expect(INTERNAL_TRAITS_SECTION,).toContain('data-testid="internal-traits-section"',);
    expect(INTERNAL_TRAITS_SECTION,).toContain("aspirations-list",);
  });

  test("proactive section carries its controls", () => {
    expect(PROACTIVE_SECTION,).toContain('data-testid="proactive-messaging-section"',);
    expect(PROACTIVE_SECTION,).toContain("proactive-frequency",);
  });
});
