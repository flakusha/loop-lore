// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW intimacy position-selection DOM builders — shared primitives.
 * Covers the four helpers `intimacy-phases.ts` reuses after the size-gate
 * split: button wiring, section shell, phase title, and the nav row.
 */

import { describe, expect, it, } from "bun:test";
import { type FakeEl, installBattleDom, } from "../tests/battle-fake-dom";
import { button, navRow, phaseTitle, sectionShell, } from "./intimacy-positions";

describe("intimacy position primitives", () => {
  it("wires button clicks behind a stable test id", () => {
    installBattleDom();
    let clicks = 0;
    const el = button("label", "nsfw-intimacy-test", () => {
      clicks += 1;
    },) as unknown as FakeEl;

    expect(el.tagName,).toBe("BUTTON",);
    expect(el.dataset["testid"],).toBe("nsfw-intimacy-test",);
    el.click();
    expect(clicks,).toBe(1,);
  });

  it("builds an accessible labelled section shell", () => {
    installBattleDom();
    const section = sectionShell("nsfw-intimacy-test",) as unknown as FakeEl;
    expect(section.dataset["testid"],).toBe("nsfw-intimacy-test",);
    expect(section.attrs["role"],).toBe("group",);
    expect((section.attrs["aria-label"] ?? "").length,).toBeGreaterThan(0,);
  });

  it("renders a non-empty localized phase title", () => {
    installBattleDom();
    const title = phaseTitle("nsfw.intimacy.positionTitle",) as unknown as FakeEl;
    expect(title.tagName,).toBe("H4",);
    expect(title.textContent.length,).toBeGreaterThan(0,);
  });

  it("renders back only when the phase offers it", () => {
    installBattleDom();
    const withBack = navRow({}, true,) as unknown as FakeEl;
    const withoutBack = navRow({}, false,) as unknown as FakeEl;
    expect(withBack.children.map((child,) => child.dataset["testid"] ?? ""),).toContain(
      "nsfw-intimacy-back",
    );

    expect(withoutBack.children.map((child,) => child.dataset["testid"] ?? ""),).not.toContain(
      "nsfw-intimacy-back",
    );

    expect(withoutBack.children.map((child,) => child.dataset["testid"] ?? ""),).toContain(
      "nsfw-intimacy-close",
    );
  });
});
