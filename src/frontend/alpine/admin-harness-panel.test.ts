// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * The Harness tab's panel markup.
 *
 * The tab's content lives in a wrapper that is hidden while loading or when a
 * load failed, so an error state never renders beside a "no data yet" empty
 * state. The discovered-models section keeps its OWN error channel, so it
 * sits OUTSIDE that wrapper: a failed runs or stats request must not blank
 * the models list, and a refused models request must not blank the runs
 * table or the stat cards. These assertions pin that placement — the
 * section's own guard is the loading guard only, never the tab-level error.
 */
import { describe, expect, test, } from "bun:test";
import { readFileSync, } from "node:fs";
import { join, } from "node:path";

const html = readFileSync(
  join(import.meta.dir, "..", "..", "components", "harness", "admin-harness-panel.html",),
  "utf8",
);

/** The tab's error wrapper: hidden while loading or when a load failed. */
const ERROR_WRAPPER = `x-show="!loadingHarness && harnessError === ''"`;

/** Where the discovered-models section starts in the panel. */
const sectionIndex = html.indexOf(`data-testid="harness-discovered-models-section"`,);

describe("admin harness panel — the discovered-models section", () => {
  test("the section exists", () => {
    expect(sectionIndex,).toBeGreaterThan(-1,);
  });

  test("the section is gated on loading only, never on the tab-level error", () => {
    const openingTag = html.slice(html.lastIndexOf("<div", sectionIndex,), sectionIndex,);
    expect(openingTag,).toContain(`x-show="!loadingHarness"`,);
    expect(openingTag,).not.toContain("harnessError",);
  });

  test("the tab's error wrapper opens again after the section", () => {
    const first = html.indexOf(ERROR_WRAPPER,);
    expect(first,).toBeGreaterThan(-1,);
    expect(html.indexOf(ERROR_WRAPPER, first + 1,),).toBeGreaterThan(sectionIndex,);
  });
});
