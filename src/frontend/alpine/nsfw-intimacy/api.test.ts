import { afterEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../../test-utils/isolate-only";
import { applyIntimacyAction, classifyApplyFailure, } from "../../nsfw/intimacy-api";
import { INTIMACY_ACTION_CATALOG, type IntimacyActionView, } from "../../nsfw/intimacy-types";

// ── Mock ../htmx (must precede importing ./state — ISOLATED pattern, see
//    nsfw-panel/api.test.ts; mock.module is process-global, so these tests
//    only run in isolated mode and never leak stubs into parallel files) ──
type ApiFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;
let calls: { url: string; opts: RequestInit }[] = [];
let handler: ApiFetchMock = async () => Response.json({},);

if (ISOLATED) {
  mock.module("../htmx", () => ({
    apiFetch: (async (url: string, opts?: RequestInit,) => {
      calls.push({ url, opts: opts ?? {}, },);
      return handler(url, opts,);
    }) satisfies ApiFetchMock,
  }),);
}

afterEach(() => {
  calls = [];
  handler = async () => Response.json({},);
},);

/** Fresh action fixture per call (no shared mutable state). */
function talkAction(): IntimacyActionView {
  const found = INTIMACY_ACTION_CATALOG.find((a,) => a.id === "talk");
  if (!found) { throw new Error("catalog missing talk",); }
  return found;
}

/** Fresh input fixture per call. */
function input() {
  return { chatId: "chat-1", actorId: "actor-a", targetActorId: "actor-b", action: talkAction(), };
}

describeOrSkip("classifyApplyFailure", () => {
  test("401 maps to auth", () => {
    expect(classifyApplyFailure(401, "",).kind,).toBe("auth",);
  });

  test("403 with the gate prefix and a consent reason maps to consent", () => {
    expect(classifyApplyFailure(403, "NSFW access denied: consent_required",).kind,).toBe("consent",);
    expect(classifyApplyFailure(403, "NSFW access denied: consent_revoked",).kind,).toBe("consent",);
  });

  test("403 gate prefix with other reasons maps to target", () => {
    expect(classifyApplyFailure(403, "NSFW access denied: underage",).kind,).toBe("target",);
  });

  test("bare 403 (Forbidden body) maps to target", () => {
    expect(classifyApplyFailure(403, "Forbidden",).kind,).toBe("target",);
  });

  test("422 maps to validation and other statuses to network", () => {
    expect(classifyApplyFailure(422, "invalid",).kind,).toBe("validation",);
    expect(classifyApplyFailure(500, "boom",).kind,).toBe("network",);
  });
},);

describeOrSkip("applyIntimacyAction", () => {
  test("posts the full action payload with chatId to the action endpoint", async () => {
    // Locale-catalog sentinel: actionName must be the localized label, not the id.
    // Without a catalog t() falls back to the raw key, which is still a non-empty
    // string distinct from the id — the second assertion keeps that mode honest.
    (globalThis as unknown as { __localeStrings: unknown }).__localeStrings = {
      nsfw: { intimacy: { action: { talk: "Talk it out", }, }, },
    };

    handler = async () => Response.json({ newScore: 12, actualDelta: 2, applied: true, thresholdsReached: [], },);
    const result = await applyIntimacyAction(input(),);
    expect(calls[0]!.url,).toBe("/api/v1/nsfw/intimacy/action",);
    const body = JSON.parse(String(calls[0]!.opts.body,),) as Record<string, unknown>;
    expect(body["chatId"],).toBe("chat-1",);
    expect(body["actorId"],).toBe("actor-a",);
    expect(body["targetActorId"],).toBe("actor-b",);
    expect(body["actionId"],).toBe("talk",);
    expect(body["actionName"],).toBe("Talk it out",);
    expect(body["actionName"],).not.toBe(body["actionId"],);
    expect(typeof body["actionName"],).toBe("string",);
    expect(body["actionType"],).toBe("verbal",);
    expect(body["delta"],).toBe(2,);
    expect(result.status,).toBe("ok",);
    expect(result.status === "ok" && result.outcome.newScore,).toBe(12,);
  });

  test("classifies a consent 403 into the consent error kind", async () => {
    handler = async () => new Response("NSFW access denied: consent_required", { status: 403, },);
    const result = await applyIntimacyAction(input(),);
    expect(result.status,).toBe("error",);
    expect(result.status === "error" && result.error.kind,).toBe("consent",);
  });

  test("classifies a validation 422 and a transport throw", async () => {
    handler = async () => new Response("bad body", { status: 422, },);
    const validation = await applyIntimacyAction(input(),);
    expect(validation.status === "error" && validation.error.kind,).toBe("validation",);

    handler = async () => {
      throw new Error("offline",);
    };

    const network = await applyIntimacyAction(input(),);
    expect(network.status === "error" && network.error.kind,).toBe("network",);
  });

  test("a non-ok body (unreadable json) degrades to network", async () => {
    handler = async () => new Response("not-json", { status: 200, headers: { "content-type": "application/json", }, },);
    const result = await applyIntimacyAction(input(),);
    expect(result.status === "error" && result.error.kind,).toBe("network",);
  });
},);
