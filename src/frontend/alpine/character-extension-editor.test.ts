import { describe, expect, test, } from "bun:test";
import {
  characterExtensionEditorFactory,
  checkBundle,
  serializeExtensions,
  type CharacterExtensionsPayload,
} from "./character-extension-editor";
import type { BundleCharacterRequirements, } from "../../plugins";

// Inline fantasy-rpg requirements literal — the source-of-truth constant
// lives in the bundle worktree (FEAT-2 follow-through). Kept in lockstep
// with `FANTASY_RPG_REQUIREMENTS` there; tests use this local literal so
// the frontend worktree doesn't need to depend on bundle work.
const FANTASY_RPG_REQUIREMENTS: BundleCharacterRequirements = {
  required: ["abilities", "inventory",],
  minLength: { inventory: 1, },
};

// ── Fetch stub (injected, never touches globalThis) ─────────
// The factory accepts an optional fetcher so we can stub network
// without monkey-patching globalThis.fetch (which other suites
// running in the same worker rely on for SSE).
type FetchCall = { url: string; init?: RequestInit; method: string };
type FetchResponder = (call: FetchCall,) => Promise<Response>;

let calls: FetchCall[] = [];
let responder: FetchResponder = () => Promise.resolve(new Response("{}", { status: 200, },),);

const makeFetcher = (): ((url: string, init?: RequestInit,) => Promise<Response>) => {
  return (url: string, init?: RequestInit,) => {
    const method = init?.method ?? "GET";
    calls.push({ url, method, init, },);
    return responder({ url, method, init, },);
  };
};

const jsonResponse = (payload: unknown, status = 200,): Response =>
  new Response(JSON.stringify(payload,), {
    status,
    headers: { "Content-Type": "application/json", },
  },);

const settingsResponse = (settings: Record<string, unknown>,): Promise<Response> =>
  Promise.resolve(jsonResponse({ data: { settings: JSON.stringify(settings,), }, },),);

const awaitLoad = async (state: { loading: boolean },): Promise<void> => {
  for (let i = 0; i < 50 && state.loading; i++) {
    await new Promise((r,) => setTimeout(r, 5,),);
  }
};

// ── Pure-function tests ───────────────────────────────────────

describe("serializeExtensions", () => {
  test("round-trips through JSON", () => {
    const payload: CharacterExtensionsPayload = {
      abilities: { strength: 15, dexterity: 11, },
      inventory: [{ id: "sword", name: "Longsword", type: "weapon", quantity: 1, equipped: true, },],
      plugin_bundle: "fantasy-rpg",
    };
    expect(JSON.parse(serializeExtensions(payload,),),).toEqual(payload,);
  },);

  test("empty draft serializes as '{}'", () => {
    expect(serializeExtensions({},),).toBe("{}",);
  },);

  test("preserves unknown keys (forward-compat passthrough)", () => {
    const parsed = JSON.parse(serializeExtensions({ plugin_bundle: "fantasy-rpg", legacy_key: "legacy_value", },),) as Record<string, unknown>;
    expect(parsed.legacy_key,).toBe("legacy_value",);
  },);
});

describe("checkBundle", () => {
  test("fantasy-rpg draft with abilities + inventory ≥ 1 is valid", () => {
    const draft: CharacterExtensionsPayload = {
      abilities: { strength: 14, },
      inventory: [{ id: "x", name: "x", type: "weapon", description: "y", quantity: 1, equipped: false, },],
    };
    const report = checkBundle(draft, FANTASY_RPG_REQUIREMENTS,);
    expect(report.valid).toBe(true);
    expect(report.missing,).toEqual([],);
  },);

  test("missing abilities → 'required: abilities'", () => {
    const draft: CharacterExtensionsPayload = {
      inventory: [{ id: "x", name: "x", type: "weapon", description: "y", quantity: 1, equipped: false, },],
    };
    const report = checkBundle(draft, FANTASY_RPG_REQUIREMENTS,);
    expect(report.valid,).toBe(false,);
    expect(report.missing,).toContain("required: abilities",);
  },);

  test("empty inventory → 'minLength: inventory < 1'", () => {
    const draft: CharacterExtensionsPayload = {
      abilities: { strength: 10, },
      inventory: [],
    };
    const report = checkBundle(draft, FANTASY_RPG_REQUIREMENTS,);
    expect(report.valid,).toBe(false,);
    expect(report.missing,).toContain("minLength: inventory < 1",);
  },);

  test("undefined requirements → always valid", () => {
    expect(checkBundle({}, undefined,).valid,).toBe(true,);
  },);
});

// ── Factory behavior ──────────────────────────────────────────

describe("characterExtensionEditorFactory", () => {
  test("factory registers globally and seeds empty state", async () => {
    calls = [];
    const fetcher = makeFetcher();
    const state = characterExtensionEditorFactory("actor-aria", FANTASY_RPG_REQUIREMENTS, fetcher,);
    await awaitLoad(state,);
    expect(typeof (globalThis as Record<string, unknown>).characterExtensionEditorFactory,).toBe("function",);
    expect(state._cxActorId,).toBe("actor-aria",);
    expect(state.draft,).toEqual({},);
  },);

  test("load() fetches settings, hydrates draft, runs validation", async () => {
    calls = [];
    const seed: CharacterExtensionsPayload = {
      plugin_bundle: "fantasy-rpg",
      abilities: { strength: 12, },
      inventory: [{ id: "x", name: "x", type: "weapon", description: "y", quantity: 1, equipped: false, },],
    };
    const fetcher = makeFetcher();
    responder = () => settingsResponse(seed,);

    const state = characterExtensionEditorFactory("actor-aria", FANTASY_RPG_REQUIREMENTS, fetcher,);
    await awaitLoad(state,);

    expect(state.loading,).toBe(false,);
    expect(calls.some((c,) => c.url === "/api/actors/actor-aria" && c.method === "GET",),).toBe(true,);
    expect(state.bundleId,).toBe("fantasy-rpg",);
    expect(state.draft.abilities,).toEqual({ strength: 12, },);
    expect(state.validation.valid,).toBe(true,);
  },);

  test("save() PUTs serialized extensions when validation passes", async () => {
    calls = [];
    const fetcher = makeFetcher();
    responder = (call,) => {
      if (call.method === "GET") { return settingsResponse({},); }
      return Promise.resolve(new Response("{}", { status: 200, },),);
    };

    const state = characterExtensionEditorFactory("actor-aria", FANTASY_RPG_REQUIREMENTS, fetcher,);
    await awaitLoad(state,);

    state.draft = {
      abilities: { strength: 14, },
      inventory: [{ id: "x", name: "x", type: "weapon", description: "y", quantity: 1, equipped: false, },],
    };
    state.bundleId = "fantasy-rpg";
    await state.save();

    const put = calls.find((c,) => c.method === "PUT" && c.url === "/api/actors/actor-aria",);
    expect(put,).toBeDefined();
    const body = JSON.parse(put!.init!.body as string,) as { settings: string };
    const parsed = JSON.parse(body.settings,) as CharacterExtensionsPayload;
    expect(parsed.abilities,).toEqual({ strength: 14, },);
    expect(parsed.inventory,).toHaveLength(1,);
    expect(state.message,).toBe("Saved",);
    expect(state.error,).toBe("",);
  },);

  test("save() aborts when validation fails (no PUT)", async () => {
    calls = [];
    const fetcher = makeFetcher();
    responder = () => settingsResponse({},);

    const state = characterExtensionEditorFactory("actor-aria", FANTASY_RPG_REQUIREMENTS, fetcher,);
    await awaitLoad(state,);

    state.draft = {};
    await state.save();

    expect(calls.some((c,) => c.method === "PUT",),).toBe(false,);
    expect(state.error,).toContain("Bundle requirements unmet",);
    expect(state.validation.valid,).toBe(false,);
  },);

  test("reset() restores draft from current (last-fetched)", async () => {
    calls = [];
    const seed: CharacterExtensionsPayload = {
      abilities: { strength: 9, },
      inventory: [{ id: "x", name: "x", type: "weapon", description: "y", quantity: 1, equipped: false, },],
    };
    const fetcher = makeFetcher();
    responder = () => settingsResponse(seed,);

    const state = characterExtensionEditorFactory("actor-aria", undefined, fetcher,);
    await awaitLoad(state,);

    state.draft.abilities = { strength: 99, };
    state.reset();
    expect(state.draft.abilities,).toEqual({ strength: 9, },);
  },);

  test("load() surfaces a non-OK status as error", async () => {
    calls = [];
    const fetcher = makeFetcher();
    responder = () => Promise.resolve(new Response("nope", { status: 500, },),);

    const state = characterExtensionEditorFactory("actor-aria", undefined, fetcher,);
    await awaitLoad(state,);

    expect(state.error,).toContain("Load failed",);
  },);

  test("save() surfaces a non-OK status as error", async () => {
    calls = [];
    const fetcher = makeFetcher();
    responder = (call,) => {
      if (call.method === "GET") { return settingsResponse({},); }
      return Promise.resolve(new Response("conflict", { status: 409, },),);
    };

    const state = characterExtensionEditorFactory("actor-aria", undefined, fetcher,);
    await awaitLoad(state,);
    state.draft = { abilities: {}, inventory: [], };
    await state.save();
    expect(state.error,).toContain("Save failed",);
  },);
});
