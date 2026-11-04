import { describe, expect, it, } from "bun:test";
import { actionLocked, reduceIntimacyFlow, } from "./intimacy-scene";
import { initialFlowState, INTIMACY_ACTION_CATALOG, type IntimacyFlowState, } from "./intimacy-types";

/** Fixed partner fixture (fresh per call — no shared mutable state). */
function partner(): { actorId: string; displayName: string } {
  return { actorId: "actor-b", displayName: "B", };
}

/** Flow state parked in partnerSelect with one partner available. */
function partnerSelectState(): IntimacyFlowState {
  return reduceIntimacyFlow(initialFlowState(), { type: "open", partners: [partner(),], },);
}

describe("actionLocked", () => {
  it("locks actions below the pair's minimum intimacy", () => {
    const kiss = INTIMACY_ACTION_CATALOG.find((a,) => a.id === "kiss")!;
    expect(actionLocked(kiss, 19,),).toBe(true,);
    expect(actionLocked(kiss, 20,),).toBe(false,);
  });

  it("never locks zero-minimum actions", () => {
    const talk = INTIMACY_ACTION_CATALOG.find((a,) => a.id === "talk")!;
    expect(actionLocked(talk, 0,),).toBe(false,);
  });
});

describe("reduceIntimacyFlow", () => {
  it("opens into partner selection", () => {
    const next = reduceIntimacyFlow(initialFlowState(), { type: "open", partners: [partner(),], },);
    expect(next.phase,).toBe("partnerSelect",);
  });

  it("routes consent-free actions straight to applying", () => {
    const talk = INTIMACY_ACTION_CATALOG.find((a,) => a.id === "talk")!;
    const state = reduceIntimacyFlow(partnerSelectState(), { type: "selectPartner", partner: partner(), },);
    const next = reduceIntimacyFlow(state, { type: "selectAction", action: talk, },);
    expect(next.phase,).toBe("applying",);
    expect(next.action?.id,).toBe("talk",);
    expect(next.partner?.actorId,).toBe("actor-b",);
  });

  it("routes consent-gated actions through the confirm phase", () => {
    const play = INTIMACY_ACTION_CATALOG.find((a,) => a.id === "play")!;
    const state = reduceIntimacyFlow(partnerSelectState(), { type: "selectPartner", partner: partner(), },);
    const confirmed = reduceIntimacyFlow(state, { type: "selectAction", action: play, },);
    expect(confirmed.phase,).toBe("confirmConsent",);
    expect(reduceIntimacyFlow(confirmed, { type: "confirmConsent", },).phase,).toBe("applying",);
  });

  it("cancel returns from the consent dialog to action selection", () => {
    const play = INTIMACY_ACTION_CATALOG.find((a,) => a.id === "play")!;
    const state = reduceIntimacyFlow(partnerSelectState(), { type: "selectPartner", partner: partner(), },);
    const dialog = reduceIntimacyFlow(state, { type: "selectAction", action: play, },);
    const next = reduceIntimacyFlow(dialog, { type: "cancelConsent", },);
    expect(next.phase,).toBe("actionSelect",);
    expect(next.action,).toBeNull();
  });

  it("applied lands in effects with the outcome", () => {
    const talk = INTIMACY_ACTION_CATALOG.find((a,) => a.id === "talk")!;
    const applying = reduceIntimacyFlow(
      reduceIntimacyFlow(partnerSelectState(), { type: "selectPartner", partner: partner(), },),
      { type: "selectAction", action: talk, },
    );

    const next = reduceIntimacyFlow(applying, {
      type: "applied",
      outcome: { newScore: 12, actualDelta: 2, applied: true, thresholdsReached: [], },
    },);

    expect(next.phase,).toBe("effects",);
    expect(next.outcome?.newScore,).toBe(12,);
  });

  it("failed lands in error with the classified error", () => {
    const talk = INTIMACY_ACTION_CATALOG.find((a,) => a.id === "talk")!;
    const applying = reduceIntimacyFlow(
      reduceIntimacyFlow(partnerSelectState(), { type: "selectPartner", partner: partner(), },),
      { type: "selectAction", action: talk, },
    );

    const next = reduceIntimacyFlow(applying, { type: "failed", error: { kind: "consent", }, },);
    expect(next.phase,).toBe("error",);
    expect(next.error?.kind,).toBe("consent",);
  });

  it("continue returns from effects to refreshed action selection", () => {
    const talk = INTIMACY_ACTION_CATALOG.find((a,) => a.id === "talk")!;
    const applying = reduceIntimacyFlow(
      reduceIntimacyFlow(partnerSelectState(), { type: "selectPartner", partner: partner(), },),
      { type: "selectAction", action: talk, },
    );

    const effects = reduceIntimacyFlow(applying, {
      type: "applied",
      outcome: { newScore: 12, actualDelta: 2, applied: true, thresholdsReached: [], },
    },);

    const next = reduceIntimacyFlow(effects, { type: "continue", },);
    expect(next.phase,).toBe("actionSelect",);
    expect(next.outcome,).toBeNull();
    expect(next.partner?.actorId,).toBe("actor-b",);
  });

  it("back steps consent → actions and actions → partners", () => {
    const play = INTIMACY_ACTION_CATALOG.find((a,) => a.id === "play")!;
    const state = reduceIntimacyFlow(partnerSelectState(), { type: "selectPartner", partner: partner(), },);
    const dialog = reduceIntimacyFlow(state, { type: "selectAction", action: play, },);
    const actions = reduceIntimacyFlow(dialog, { type: "back", },);
    expect(actions.phase,).toBe("actionSelect",);
    const partners = reduceIntimacyFlow(actions, { type: "back", },);
    expect(partners.phase,).toBe("partnerSelect",);
    expect(partners.partner,).toBeNull();
  });

  it("close resets to idle from any phase", () => {
    const next = reduceIntimacyFlow(partnerSelectState(), { type: "close", },);
    expect(next,).toEqual(initialFlowState(),);
  });

  it("ignores out-of-phase events (no track jumping)", () => {
    const idle = initialFlowState();
    expect(reduceIntimacyFlow(idle, { type: "confirmConsent", },),).toBe(idle,);
    expect(
      reduceIntimacyFlow(idle, {
        type: "applied",
        outcome: { newScore: 1, actualDelta: 1, applied: true, thresholdsReached: [], },
      },),
    ).toBe(idle,);

    const selecting = partnerSelectState();
    expect(reduceIntimacyFlow(selecting, { type: "failed", error: { kind: "network", }, },),).toBe(selecting,);
  });

  it("never mutates the input state (pure reducer)", () => {
    const before = partnerSelectState();
    const snapshot = structuredClone(before,);
    reduceIntimacyFlow(before, { type: "selectPartner", partner: partner(), },);
    expect(before,).toEqual(snapshot,);
  });
});
