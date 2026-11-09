import { afterEach, beforeEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../../test-utils/isolate-only";
import { INTIMACY_ACTION_CATALOG, type IntimacyPartnerOption, } from "../../nsfw/intimacy-types";
import type { FakeEl, } from "../../tests/battle-fake-dom";
import { clearFocusLog, installBattleDom, makeEl, } from "../../tests/battle-fake-dom";
import { intimacyState, } from "./state";

// ── Mock ../htmx (must precede importing ./state — ISOLATED pattern;
//    mock.module is process-global, never leaks into parallel files) ──
type ApiFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;
let calls: { url: string; opts: RequestInit }[] = [];
let actionHandler: ApiFetchMock = async () => Response.json({},);
let locationConfig: unknown = { privacyLevel: "private", locationType: "bedroom", };
let locationStatus = 200;

/** Route chats reads to a fixed character; the action POST to the test handler. */
const handler: ApiFetchMock = async (url, opts,) => {
  if (typeof url === "string" && url.includes("/chats/",)) {
    return Response.json({ character_id: "actor-a", current_location_id: "loc-1", },);
  }

  if (typeof url === "string" && url.includes("/nsfw/location/",)) {
    if (locationStatus !== 200) { return new Response("denied", { status: locationStatus, },); }
    return Response.json(locationConfig,);
  }

  calls.push({ url, opts: opts ?? {}, },);
  return actionHandler(url, opts,);
};

if (ISOLATED) {
  mock.module("../htmx", () => ({
    apiFetch: (async (url: string, opts?: RequestInit,) => handler(url, opts,)) satisfies ApiFetchMock,
  }),);
}

/** Flush the dispatch chain (two fetch hops through mocked microtasks). */
async function flush(): Promise<void> {
  await Bun.sleep(2,);
}

/** Recording fake mount slot (fresh per ctx — no shared state). */
function makeSlot(): FakeEl {
  return makeEl("div",);
}

interface Ctx {
  activeChat: string | null;
  _participants: { actor_id: string; display_name: string }[];
  currentCharacter?: { id?: string } | null;
  _nsfwIntimacy: { targetActorId: string; score: number }[] | null;
  _intimacyFlow: {
    phase: string;
    partner: IntimacyPartnerOption | null;
    position: { id: string } | null;
    action: { id: string } | null;
    outcome: unknown;
    error: { kind: string } | null;
  };
  _intimacyPartners: IntimacyPartnerOption[];
  $refs?: { intimacyPanel?: { children: unknown[]; replaceChildren(): void; append(el: unknown,): void } };
  openIntimacy(): void;
  selectPartner(actorId: string,): void;
  selectPosition(positionId: string,): void;
  selectAction(actionId: string,): void;
  confirmConsent(): Promise<void>;
  cancelConsent(): void;
  closeIntimacy(): void;
  dispatchIntimacy(): Promise<void>;
  [key: string]: unknown;
}

/** Build a fresh chat-state fixture with bound mixin methods (per test). */
function buildCtx(overrides: Partial<Ctx> = {},): Ctx {
  const slot = makeSlot();
  const ctx = {
    activeChat: "chat-1",
    _participants: [
      { actor_id: "actor-a", display_name: "Ava", },
      { actor_id: "actor-b", display_name: "Basil", },
    ],
    currentCharacter: { id: "actor-a", },
    _nsfwIntimacy: [{ targetActorId: "actor-b", score: 45, },],
    _intimacyFlow: { phase: "idle", partner: null, position: null, action: null, outcome: null, error: null, },
    _intimacyPartners: [],
    $refs: { intimacyPanel: slot, },
    ...overrides,
  };

  for (
    const key of [
      "openIntimacy",
      "selectPartner",
      "selectPosition",
      "selectAction",
      "confirmConsent",
      "cancelConsent",
      "backIntimacy",
      "continueIntimacy",
      "closeIntimacy",
      "dispatchIntimacy",
      "retryIntimacy",
      "loadPrivateSpace",
      "mountIntimacyPanel",
    ]
  ) {
    (ctx as Record<string, unknown>)[key] = (...args: unknown[]) =>
      (intimacyState as unknown as Record<string, (...a: unknown[]) => unknown>)[key]!.apply(ctx as never, args,);
  }

  return ctx as Ctx;
}

afterEach(() => {
  calls = [];
  actionHandler = async () => Response.json({},);
  locationConfig = { privacyLevel: "private", locationType: "bedroom", };
  locationStatus = 200;
  clearFocusLog();
},);

// The mixin mounts DOM via renderIntimacyPanel — install the fake DOM before
// any flow method runs (fresh globals under --isolate).
beforeEach(() => {
  installBattleDom();
},);

describeOrSkip("openIntimacy", () => {
  test("lists partners excluding the character and renders the partner phase", () => {
    const ctx = buildCtx();
    ctx.openIntimacy();
    expect(ctx._intimacyPartners.map((p,) => p.actorId),).toEqual(["actor-b",],);
    expect(ctx._intimacyFlow.phase,).toBe("partnerSelect",);
    expect(ctx.$refs!.intimacyPanel!.children,).toHaveLength(1,);
  });

  test("mounts nothing without a slot (no-op)", () => {
    const ctx = buildCtx({ $refs: undefined, },);
    expect(() => ctx.openIntimacy()).not.toThrow();
  });
},);

describeOrSkip("selectPosition", () => {
  test("advances positionSelect to actionSelect and echoes staging in effects", () => {
    const ctx = buildCtx();
    ctx.openIntimacy();
    ctx.selectPartner("actor-b",);
    ctx.selectPosition("embrace-hold",);
    expect(ctx._intimacyFlow.phase,).toBe("actionSelect",);
    expect(ctx._intimacyFlow.position?.id,).toBe("embrace-hold",);
    const staging = (ctx.$refs!.intimacyPanel!.children[0] as { children: unknown[] }).children;
    expect(staging.length,).toBeGreaterThan(0,);
  });

  test("ignores unknown position ids", () => {
    const ctx = buildCtx();
    ctx.openIntimacy();
    ctx.selectPartner("actor-b",);
    ctx.selectPosition("nope",);
    expect(ctx._intimacyFlow.phase,).toBe("positionSelect",);
  });

  test("back steps actions → positions → partners", () => {
    const ctx = buildCtx();
    ctx.openIntimacy();
    ctx.selectPartner("actor-b",);
    ctx.selectPosition("facing",);
    (ctx._intimacyFlow as { phase: string }).phase = "actionSelect";
    (ctx.backIntimacy as () => void)();
    expect(ctx._intimacyFlow.phase,).toBe("positionSelect",);
    (ctx.backIntimacy as () => void)();
    expect(ctx._intimacyFlow.phase,).toBe("partnerSelect",);
  });
},);

describeOrSkip("dispatchIntimacy", () => {
  test("consent flow: partner → position → confirm posts the consent grant then lands in effects", async () => {
    actionHandler = async (url,) => {
      if (typeof url === "string" && url === "/api/v1/nsfw/consent") {
        return Response.json({ granted: true, },);
      }

      return Response.json({ newScore: 53, actualDelta: 8, applied: true, thresholdsReached: [], },);
    };

    const ctx = buildCtx();
    ctx.openIntimacy();
    ctx.selectPartner("actor-b",);
    expect(ctx._intimacyFlow.phase,).toBe("positionSelect",);

    ctx.selectPosition("facing",);
    expect(ctx._intimacyFlow.phase,).toBe("actionSelect",);

    ctx.selectAction("play",);
    expect(ctx._intimacyFlow.phase,).toBe("confirmConsent",);
    await ctx.confirmConsent();

    await flush();
    const consentCall = calls.find((call,) => call.url === "/api/v1/nsfw/consent")!;
    const grantBody = JSON.parse(String(consentCall.opts.body,),) as Record<string, unknown>;
    expect(grantBody["chatId"],).toBe("chat-1",);
    expect(grantBody["action"],).toBe("given",);
    const actionCall = calls.at(-1,)!;
    expect(actionCall.url,).toBe("/api/v1/nsfw/intimacy/action",);
    const body = JSON.parse(String(actionCall.opts.body,),) as Record<string, unknown>;
    expect(body["chatId"],).toBe("chat-1",);
    expect(body["targetActorId"],).toBe("actor-b",);
    expect(body["context"],).toBe("near/facing:facing",);
    expect(ctx._intimacyFlow.phase,).toBe("effects",);
  });

  test("a refused consent grant parks the flow in the classified error phase", async () => {
    actionHandler = async (url,) => {
      if (typeof url === "string" && url === "/api/v1/nsfw/consent") {
        return Response.json(
          { error: "NSFW access denied: consent_revoked", code: "FORBIDDEN", meta: { api_version: "1", }, },
          { status: 403, },
        );
      }

      return Response.json({ newScore: 1, actualDelta: 1, applied: true, thresholdsReached: [], },);
    };

    const ctx = buildCtx();
    ctx.openIntimacy();
    ctx.selectPartner("actor-b",);
    ctx.selectPosition("facing",);
    ctx.selectAction("play",);
    expect(ctx._intimacyFlow.phase,).toBe("confirmConsent",);
    await ctx.confirmConsent();

    await flush();
    expect(ctx._intimacyFlow.phase,).toBe("error",);
    expect(ctx._intimacyFlow.error?.kind,).toBe("consent",);
    expect(calls.some((call,) => call.url === "/api/v1/nsfw/intimacy/action"),).toBe(false,);
  });

  test("a consent 403 parks the flow in the consent error phase", async () => {
    actionHandler = async () =>
      Response.json(
        { error: "NSFW access denied: consent_required", code: "FORBIDDEN", meta: { api_version: "1", }, },
        { status: 403, },
      );

    const ctx = buildCtx();
    ctx.openIntimacy();
    ctx.selectPartner("actor-b",);
    const talk = INTIMACY_ACTION_CATALOG.find((a,) => a.id === "talk")!;
    ctx.selectPosition("side-by-side",);
    ctx.selectAction(talk.id,);
    expect(ctx._intimacyFlow.phase,).toBe("applying",);

    await flush();
    expect(ctx._intimacyFlow.phase,).toBe("error",);
    expect(ctx._intimacyFlow.error?.kind,).toBe("consent",);
  });

  test("a second confirm during the grant POST is a no-op (single-flight)", async () => {
    let release = false;
    actionHandler = async (url,) => {
      if (typeof url === "string" && url === "/api/v1/nsfw/consent") {
        while (!release) { await Bun.sleep(1,); }
        return Response.json({ granted: true, },);
      }

      return Response.json({ newScore: 53, actualDelta: 8, applied: true, thresholdsReached: [], },);
    };

    const ctx = buildCtx();
    ctx.openIntimacy();
    ctx.selectPartner("actor-b",);
    ctx.selectPosition("facing",);
    ctx.selectAction("play",);
    const first = ctx.confirmConsent();
    expect(ctx._intimacyFlow.phase,).toBe("applying",);
    await ctx.confirmConsent();
    release = true;
    await first;
    await flush();

    const grants = calls.filter((call,) => call.url === "/api/v1/nsfw/consent");
    expect(grants,).toHaveLength(1,);
  });

  test("a cancel racing the grant POST is swallowed (confirm already committed)", async () => {
    let release = false;
    actionHandler = async (url,) => {
      if (typeof url === "string" && url === "/api/v1/nsfw/consent") {
        while (!release) { await Bun.sleep(1,); }
        return Response.json({ granted: true, },);
      }

      return Response.json({ newScore: 53, actualDelta: 8, applied: true, thresholdsReached: [], },);
    };

    const ctx = buildCtx();
    ctx.openIntimacy();
    ctx.selectPartner("actor-b",);
    ctx.selectPosition("side-by-side",);
    ctx.selectAction("play",);
    const pending = ctx.confirmConsent();
    ctx.cancelConsent();
    release = true;
    await pending;
    await flush();

    // Confirm committed synchronously: the racing cancel is a reducer
    // no-op, so the granted flow still dispatches exactly once.
    const grants = calls.filter((call,) => call.url === "/api/v1/nsfw/consent");
    expect(grants,).toHaveLength(1,);
    expect(ctx._intimacyFlow.phase,).toBe("effects",);
  });

  test("a stale chat switch discards the in-flight dispatch", async () => {
    let release = false;
    actionHandler = async () => {
      while (!release) { await Bun.sleep(1,); }
      return Response.json({ newScore: 1, actualDelta: 1, applied: true, thresholdsReached: [], },);
    };

    const ctx = buildCtx();
    ctx.openIntimacy();
    ctx.selectPartner("actor-b",);
    ctx.selectPosition("side-by-side",);
    const talk = INTIMACY_ACTION_CATALOG.find((a,) => a.id === "talk")!;
    ctx.selectAction(talk.id,);

    const dispatch = ctx.dispatchIntimacy() as Promise<void>;
    await Bun.sleep(2,);
    ctx.activeChat = "chat-2";
    release = true;
    await dispatch;
    expect(ctx._intimacyFlow.phase,).toBe("applying",);
  });
},);

describeOrSkip("closeIntimacy", () => {
  test("resets the flow to idle", () => {
    const ctx = buildCtx();
    ctx.openIntimacy();
    ctx.closeIntimacy();
    expect(ctx._intimacyFlow.phase,).toBe("idle",);
  });
},);

describeOrSkip("loadPrivateSpace", () => {
  test("loads the venue view and renders it under the flow panel", async () => {
    const ctx = buildCtx() as unknown as Record<string, unknown>;
    await (intimacyState as unknown as { loadPrivateSpace: (this: unknown,) => Promise<void> }).loadPrivateSpace.call(
      ctx,
    );

    const view = ctx["_privateSpaceView"] as { suitable: boolean; locationType: string } | null;
    expect(view?.suitable,).toBe(true,);
    expect(view?.locationType,).toBe("bedroom",);
  });

  test("a 403 hides the section (null view, consent gate holds)", async () => {
    locationStatus = 403;
    const ctx = buildCtx() as unknown as Record<string, unknown>;
    await (intimacyState as unknown as { loadPrivateSpace: (this: unknown,) => Promise<void> }).loadPrivateSpace.call(
      ctx,
    );

    expect(ctx["_privateSpaceView"],).toBeNull();
  });

  test("a chat switch mid-flight discards the stale result", async () => {
    locationConfig = { privacyLevel: "isolated", locationType: "suite", };
    const ctx = buildCtx() as unknown as Record<string, unknown> & { activeChat: string | null };
    const load = (intimacyState as unknown as { loadPrivateSpace: (this: unknown,) => Promise<void> }).loadPrivateSpace
      .call(ctx,);

    ctx.activeChat = "chat-2";
    await load;
    expect(ctx["_privateSpaceView"],).toBeUndefined();
  });
},);

// Keep the mock import referenced in non-isolated runs (the file is a no-op
// there; describeOrSkip skips every suite).
void mock;
