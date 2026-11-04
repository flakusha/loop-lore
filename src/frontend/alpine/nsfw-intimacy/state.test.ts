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

/** Route chats reads to a fixed character; the action POST to the test handler. */
const handler: ApiFetchMock = async (url, opts,) => {
  if (typeof url === "string" && url.includes("/chats/",)) {
    return Response.json({ character_id: "actor-a", },);
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
    action: { id: string } | null;
    outcome: unknown;
    error: { kind: string } | null;
  };
  _intimacyPartners: IntimacyPartnerOption[];
  $refs?: { intimacyPanel?: { children: unknown[]; replaceChildren(): void; append(el: unknown,): void } };
  openIntimacy(): void;
  selectPartner(actorId: string,): void;
  selectAction(actionId: string,): void;
  confirmConsent(): void;
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
    _intimacyFlow: { phase: "idle", partner: null, action: null, outcome: null, error: null, },
    _intimacyPartners: [],
    $refs: { intimacyPanel: slot, },
    ...overrides,
  };

  for (
    const key of [
      "openIntimacy",
      "selectPartner",
      "selectAction",
      "confirmConsent",
      "cancelConsent",
      "backIntimacy",
      "continueIntimacy",
      "closeIntimacy",
      "dispatchIntimacy",
      "retryIntimacy",
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

describeOrSkip("dispatchIntimacy", () => {
  test("consent flow: select → confirm posts chatId and lands in effects", async () => {
    actionHandler = async () => Response.json({ newScore: 53, actualDelta: 8, applied: true, thresholdsReached: [], },);
    const ctx = buildCtx();
    ctx.openIntimacy();
    ctx.selectPartner("actor-b",);
    expect(ctx._intimacyFlow.phase,).toBe("actionSelect",);

    ctx.selectAction("play",);
    expect(ctx._intimacyFlow.phase,).toBe("confirmConsent",);
    ctx.confirmConsent();

    await flush();
    const actionCall = calls.at(-1,)!;
    expect(actionCall.url,).toBe("/api/v1/nsfw/intimacy/action",);
    const body = JSON.parse(String(actionCall.opts.body,),) as Record<string, unknown>;
    expect(body["chatId"],).toBe("chat-1",);
    expect(body["targetActorId"],).toBe("actor-b",);
    expect(ctx._intimacyFlow.phase,).toBe("effects",);
  });

  test("a consent 403 parks the flow in the consent error phase", async () => {
    actionHandler = async () => new Response("NSFW access denied: consent_required", { status: 403, },);
    const ctx = buildCtx();
    ctx.openIntimacy();
    ctx.selectPartner("actor-b",);
    const talk = INTIMACY_ACTION_CATALOG.find((a,) => a.id === "talk")!;
    ctx.selectAction(talk.id,);
    expect(ctx._intimacyFlow.phase,).toBe("applying",);

    await flush();
    expect(ctx._intimacyFlow.phase,).toBe("error",);
    expect(ctx._intimacyFlow.error?.kind,).toBe("consent",);
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

// Keep the mock import referenced in non-isolated runs (the file is a no-op
// there; describeOrSkip skips every suite).
void mock;
