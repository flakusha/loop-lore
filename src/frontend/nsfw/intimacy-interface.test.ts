import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { clearFocusLog, type FakeEl, installBattleDom, } from "../tests/battle-fake-dom";
import { renderIntimacyPanel, } from "./intimacy-interface";
import { INTIMACY_ACTION_CATALOG, type IntimacyFlowState, type IntimacyPartnerOption, } from "./intimacy-types";

/** Fixed partner fixture (fresh per call). */
function partner(): IntimacyPartnerOption {
  return { actorId: "actor-b", displayName: "Basil", };
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

/** Subtree elements carrying the given data-testid (fake DOM helper). */
function byTestId(root: FakeEl, testId: string,): FakeEl[] {
  return byTag(root, "*",).filter((el,) => el.dataset["testid"] === testId);
}

/** Render a panel section for the given state (fresh per test — no shared DOM). */
function render(state: IntimacyFlowState, partners: IntimacyPartnerOption[] = [partner(),], pairScore = 45,): FakeEl {
  return renderIntimacyPanel(state, { partners, pairScore, handlers: {}, },) as unknown as FakeEl;
}

beforeEach(() => {
  installBattleDom();
},);

afterEach(() => {
  clearFocusLog();
},);

describe("renderIntimacyPanel — partnerSelect", () => {
  it("renders one button per partner with the displayName", () => {
    const section = render({ phase: "partnerSelect", partner: null, action: null, outcome: null, error: null, },);
    const partnerButtons = byTag(section, "button",).filter((b,) => !(b.dataset["testid"] ?? "").includes("close",));
    expect(partnerButtons,).toHaveLength(1,);
    expect(textOf(partnerButtons[0]!,),).toContain("Basil",);
  });

  it("renders the empty state (no partner buttons) when no partners exist", () => {
    const section = render({ phase: "partnerSelect", partner: null, action: null, outcome: null, error: null, }, [],);
    expect(byTestId(section, "nsfw-intimacy-empty",),).toHaveLength(1,);
    expect(byTag(section, "button",).filter((b,) => (b.dataset["testid"] ?? "").startsWith("nsfw-intimacy-partner-",)),)
      .toHaveLength(0,);
  });
});

describe("renderIntimacyPanel — actionSelect", () => {
  it("lists every catalog action and disables locked ones", () => {
    const section = render({ phase: "actionSelect", partner: partner(), action: null, outcome: null, error: null, }, [
      partner(),
    ], 0,);

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
});

describe("renderIntimacyPanel — confirmConsent / applying / effects / error", () => {
  it("renders the consent question naming the action", () => {
    const play = INTIMACY_ACTION_CATALOG.find((a,) => a.id === "play")!;
    const section = render({ phase: "confirmConsent", partner: partner(), action: play, outcome: null, error: null, },);
    expect(byTestId(section, "nsfw-intimacy-consent-body",),).toHaveLength(1,);
    expect(textOf(section,),).toContain("nsfw.intimacy.consentBody",); // raw i18n key in tests (no catalog loaded)
    expect(byTestId(section, "nsfw-intimacy-consent-confirm",),).toHaveLength(1,);
    expect(byTestId(section, "nsfw-intimacy-consent-cancel",),).toHaveLength(1,);
  });

  it("renders a buttonless busy section while applying", () => {
    const section = render({ phase: "applying", partner: partner(), action: null, outcome: null, error: null, },);
    expect(byTag(section, "button",),).toHaveLength(0,);
    expect(textOf(section,),).toContain("nsfw.intimacy.applying",);
  });

  it("shows the outcome delta row in the effects phase", () => {
    const talk = INTIMACY_ACTION_CATALOG.find((a,) => a.id === "talk")!;
    const section = render({
      phase: "effects",
      partner: partner(),
      action: talk,
      outcome: { newScore: 53, actualDelta: 8, applied: true, thresholdsReached: [], },
      error: null,
    },);

    const delta = byTestId(section, "nsfw-intimacy-delta",);
    expect(delta,).toHaveLength(1,);
    expect(byTestId(section, "nsfw-intimacy-continue",),).toHaveLength(1,);
  });

  it("shows a retry button in the error phase", () => {
    const section = render({
      phase: "error",
      partner: partner(),
      action: null,
      outcome: null,
      error: { kind: "consent", },
    },);

    expect(byTestId(section, "nsfw-intimacy-retry",),).toHaveLength(1,);
  });
});

describe("renderIntimacyPanel — idle", () => {
  it("renders only the open trigger for the idle phase", () => {
    const section = render({ phase: "idle", partner: null, action: null, outcome: null, error: null, }, [],);
    expect(byTestId(section, "nsfw-intimacy-open",),).toHaveLength(1,);
  });
});
