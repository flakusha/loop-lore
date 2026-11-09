// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { clearFocusLog, type FakeEl, installBattleDom, } from "../tests/battle-fake-dom";
import {
  renderActionSelect,
  renderApplying,
  renderConfirmConsent,
  renderEffects,
  renderError,
  renderIdle,
  renderPartnerSelect,
  renderPositionSelect,
} from "./intimacy-phases";
import {
  INTIMACY_ACTION_CATALOG,
  type IntimacyFlowState,
  type IntimacyPartnerOption,
} from "./intimacy-types";

/** Fixed partner fixture (fresh per call). */
function partner(): IntimacyPartnerOption {
  return { actorId: "actor-b", displayName: "Basil", };
}

/** Blank flow state parked in the given phase. */
function blankState(phase: IntimacyFlowState["phase"],): IntimacyFlowState {
  return { phase, partner: null, position: null, action: null, outcome: null, error: null, };
}

/** All descendant elements with the given tag name (fake DOM has no querySelectorAll). */
function byTag(root: FakeEl, tag: string,): FakeEl[] {
  const hits: FakeEl[] = [];
  for (const child of root.children) {
    if (tag === "*" || child.tagName === tag.toUpperCase()) { hits.push(child,); }
    hits.push(...byTag(child, tag,),);
  }

  return hits;
}

/** Concatenated textContent of the subtree (fake DOM does not derive it). */
function textOf(root: FakeEl,): string {
  return (root.textContent ?? "") + root.children.map(textOf,).join(" ",);
}

/** Subtree elements carrying the given data-testid. */
function byTestId(root: FakeEl, testId: string,): FakeEl[] {
  return byTag(root, "*",).filter((el,) => el.dataset["testid"] === testId);
}

beforeEach(() => {
  installBattleDom();
},);

afterEach(() => {
  clearFocusLog();
},);

describe("renderIdle", () => {
  it("renders only the open trigger", () => {
    const section = renderIdle({},) as unknown as FakeEl;
    expect(byTestId(section, "nsfw-intimacy-open",),).toHaveLength(1,);
    expect(textOf(section,),).toContain("nsfw.intimacy.open",);
  });
});

describe("renderPartnerSelect", () => {
  it("renders one button per partner with the displayName", () => {
    const section = renderPartnerSelect(blankState("partnerSelect",), [partner(),], {},) as unknown as FakeEl;
    const partnerButtons = byTag(section, "button",).filter(
      (b,) => (b.dataset["testid"] ?? "").startsWith("nsfw-intimacy-partner-",),
    );

    expect(partnerButtons,).toHaveLength(1,);
    expect(textOf(partnerButtons[0]!,),).toContain("Basil",);
  });

  it("marks the chosen partner pressed and renders the empty state without partners", () => {
    const chosen = renderPartnerSelect(
      { ...blankState("partnerSelect",), partner: partner(), },
      [partner(),],
      {},
    ) as unknown as FakeEl;

    const pressed = byTag(chosen, "button",).filter(
      (b,) => (b.dataset["testid"] ?? "").startsWith("nsfw-intimacy-partner-",),
    );

    expect(pressed[0]?.attrs["aria-pressed"],).toBe("true",);

    const empty = renderPartnerSelect(blankState("partnerSelect",), [], {},) as unknown as FakeEl;
    expect(byTestId(empty, "nsfw-intimacy-empty",),).toHaveLength(1,);
    expect(
      byTag(empty, "button",).filter((b,) => (b.dataset["testid"] ?? "").startsWith("nsfw-intimacy-partner-",)),
    ).toHaveLength(0,);
  });
});

describe("renderPositionSelect", () => {
  it("renders one button and description per catalog position", () => {
    installBattleDom();
    const section = renderPositionSelect(blankState("positionSelect",), {},) as unknown as FakeEl;
    for (const id of ["side-by-side", "facing", "embrace-hold",] as const) {
      expect(byTestId(section, `nsfw-intimacy-position-${id}`,).length,).toBe(1,);
      expect(byTestId(section, `nsfw-intimacy-position-cell-${id}`,).length,).toBe(1,);
    }
  });
});

describe("renderActionSelect", () => {
  it("lists every catalog action and disables locked ones", () => {
    const section = renderActionSelect(0, {},) as unknown as FakeEl;
    const actionButtons = byTag(section, "button",).filter((b,) =>
      (b.dataset["testid"] ?? "").startsWith("nsfw-intimacy-action-",)
    );

    expect(actionButtons,).toHaveLength(INTIMACY_ACTION_CATALOG.length,);
    const locked = actionButtons.filter((b,) => b.disabled);
    expect(locked.length,).toBeGreaterThan(0,);
    for (const b of locked) {
      expect(b.attrs["aria-disabled"],).toBe("true",);
    }
  });

  it("enables every action at a high pair score", () => {
    const section = renderActionSelect(100, {},) as unknown as FakeEl;
    const actionButtons = byTag(section, "button",).filter((b,) =>
      (b.dataset["testid"] ?? "").startsWith("nsfw-intimacy-action-",)
    );

    expect(actionButtons.filter((b,) => b.disabled),).toHaveLength(0,);
  });
});

describe("renderConfirmConsent", () => {
  it("renders the consent question naming the action", () => {
    const play = INTIMACY_ACTION_CATALOG.find((a,) => a.id === "play")!;
    const section = renderConfirmConsent(
      { ...blankState("confirmConsent",), partner: partner(), action: play, },
      {},
    ) as unknown as FakeEl;

    expect(byTestId(section, "nsfw-intimacy-consent-body",),).toHaveLength(1,);
    expect(textOf(section,),).toContain("nsfw.intimacy.consentBody",);
    expect(byTestId(section, "nsfw-intimacy-consent-confirm",),).toHaveLength(1,);
    expect(byTestId(section, "nsfw-intimacy-consent-cancel",),).toHaveLength(1,);
  });
});

describe("renderApplying", () => {
  it("renders a buttonless busy section", () => {
    const section = renderApplying() as unknown as FakeEl;
    expect(byTag(section, "button",),).toHaveLength(0,);
    expect(textOf(section,),).toContain("nsfw.intimacy.applying",);
  });
});

describe("renderEffects", () => {
  it("shows the outcome delta row and the continue trigger", () => {
    const talk = INTIMACY_ACTION_CATALOG.find((a,) => a.id === "talk")!;
    const section = renderEffects(
      {
        ...blankState("effects",),
        partner: partner(),
        action: talk,
        outcome: { newScore: 53, actualDelta: 8, applied: true, thresholdsReached: [], },
      },
      {},
    ) as unknown as FakeEl;

    expect(byTestId(section, "nsfw-intimacy-delta",),).toHaveLength(1,);
    expect(byTestId(section, "nsfw-intimacy-continue",),).toHaveLength(1,);
  });

  it("renders an empty section without an outcome", () => {
    const section = renderEffects(blankState("effects",), {},) as unknown as FakeEl;
    expect(byTestId(section, "nsfw-intimacy-delta",),).toHaveLength(0,);
  });
});

describe("renderError", () => {
  it("shows a retry button for consent failures", () => {
    const section = renderError(
      { ...blankState("error",), error: { kind: "consent", }, },
      {},
    ) as unknown as FakeEl;

    expect(byTestId(section, "nsfw-intimacy-retry",),).toHaveLength(1,);
    expect(byTestId(section, "nsfw-intimacy-error-msg",),).toHaveLength(1,);
  });

  it("omits the retry button for auth failures", () => {
    const section = renderError(
      { ...blankState("error",), error: { kind: "auth", }, },
      {},
    ) as unknown as FakeEl;

    expect(byTestId(section, "nsfw-intimacy-retry",),).toHaveLength(0,);
  });
});
