// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Authoring tree client: `init()` is the only session-gated load, and every
 * tree write goes through `apiFetch` (never bare fetch) with the wire shapes
 * the IVSS routes own. The fetch stub records URLs + bodies; nothing reaches
 * the network.
 */
import { afterEach, describe, expect, test, } from "bun:test";
import {
  ScenarioStatus,
  SceneMode,
  SceneStatus,
} from "../../db/enums-generation";
import { ivssAuthoring, } from "./ivss-authoring";
import type { IvssScenarioDetail, IvssScene, } from "./ivss-authoring-types";

const host = globalThis as unknown as {
  fetch: typeof fetch;
  document: { querySelector: (sel: string,) => unknown; cookie?: string };
  __USER_ID?: string;
  confirm?: (message?: string,) => boolean;
};

const realFetch = host.fetch;
const realDocument = host.document;
const realUserId = host.__USER_ID;
const realConfirm = host.confirm;

afterEach(() => {
  host.fetch = realFetch;
  host.document = realDocument;
  if (realUserId === undefined) {
    delete host.__USER_ID;
  } else {
    host.__USER_ID = realUserId;
  }

  if (realConfirm === undefined) {
    delete host.confirm;
  } else {
    host.confirm = realConfirm;
  }
},);

interface CapturedCall {
  url: string;
  method: string;
  body: string;
}

/** Capture apiFetch calls and answer every one with canned JSON. */
function stubNetwork(responder: (url: string,) => unknown,): CapturedCall[] {
  const calls: CapturedCall[] = [];
  host.fetch = (async (input: string | URL | Request, init?: RequestInit,) => {
    const url = String(input,);
    calls.push({
      url,
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : "",
    },);

    return new Response(JSON.stringify(responder(url,),), {
      status: 200,
      headers: { "Content-Type": "application/json", },
    },);
  }) as typeof fetch;

  // feFetch reads the CSRF meta tag/cookie before every request.
  host.document = { querySelector: () => null, cookie: "", };
  return calls;
}

const CREATED_AT = "2026-01-01T00:00:00.000Z";

function sceneRow(id: string, sortOrder: number,): IvssScene {
  return {
    id,
    scenarioId: "s1",
    sortOrder,
    locationId: null,
    mode: SceneMode.TextToVideo,
    durationFrames: 120,
    fps: 24,
    seed: null,
    status: SceneStatus.Planned,
    generatedAssetId: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    shots: [],
    fragments: [],
  };
}

function scenarioTree(): IvssScenarioDetail {
  return {
    id: "s1",
    worldId: "w1",
    title: "Demo",
    status: ScenarioStatus.Draft,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    scenes: [sceneRow("scene-a", 0,), sceneRow("scene-b", 1,), sceneRow("scene-c", 2,),],
    references: [],
    docs: [],
  };
}

describe("ivssAuthoring", () => {
  test("registers a global so x-data can call ivssAuthoring()", () => {
    expect((globalThis as unknown as Record<string, unknown>).ivssAuthoring,).toBe(
      ivssAuthoring,
    );
  });

  test("init loads the scenario list", async () => {
    const listed = [{
      id: "s1",
      worldId: "w1",
      title: "Demo",
      status: ScenarioStatus.Draft,
      updatedAt: CREATED_AT,
    },];

    const calls = stubNetwork(() => listed);
    host.__USER_ID = "user-1";
    const page = ivssAuthoring();

    await page.init();

    expect(calls.map((call,) => call.url),).toEqual(["/api/v1/ivss/scenarios",],);
    expect(page.scenarios,).toEqual(listed,);
    expect(page.error,).toBe("",);
  });

  test("addScene posts the scene draft to the scenario's scene endpoint", async () => {
    const calls = stubNetwork(() => scenarioTree());
    host.__USER_ID = "user-1";
    const page = ivssAuthoring();
    page.scenarioId = "s1";
    page.tree = scenarioTree();

    await page.addScene();

    expect(calls[0]?.url,).toBe("/api/v1/ivss/scenarios/s1/scenes",);
    expect(calls[0]?.method,).toBe("POST",);
    expect(JSON.parse(calls[0]?.body ?? "null",),).toEqual({
      mode: SceneMode.TextToVideo,
      durationFrames: 120,
      fps: 24,
    },);

    expect(calls[1]?.url,).toBe("/api/v1/ivss/scenarios/s1",);
  });

  test("move posts the expected ordered ids and reloads the tree", async () => {
    const calls = stubNetwork(() => scenarioTree());
    host.__USER_ID = "user-1";
    const page = ivssAuthoring();
    page.scenarioId = "s1";
    page.tree = scenarioTree();

    await page.move("scene", "scene-b", -1,);

    expect(calls[0]?.url,).toBe("/api/v1/ivss/reorder",);
    expect(JSON.parse(calls[0]?.body ?? "null",),).toEqual({
      kind: "scene",
      ids: ["scene-b", "scene-a", "scene-c",],
    },);

    expect(calls[1]?.url,).toBe("/api/v1/ivss/scenarios/s1",);
  });

  test("no fetch happens without a user", async () => {
    const calls = stubNetwork(() => []);
    delete host.__USER_ID;
    const page = ivssAuthoring();

    await page.init();

    expect(calls,).toEqual([],);
    expect(page.error,).toContain("Sign in",);
  });

  test("createScenario posts the draft and selects the new scenario", async () => {
    const calls = stubNetwork((url,) => url === "/api/v1/ivss/scenarios" ? { id: "s2", } : scenarioTree());
    host.__USER_ID = "user-1";
    const page = ivssAuthoring();
    page.draftScenario = { worldId: "w1", title: "New", };

    await page.createScenario();

    expect(calls[0]?.url,).toBe("/api/v1/ivss/scenarios",);
    expect(calls[0]?.method,).toBe("POST",);
    expect(JSON.parse(calls[0]?.body ?? "null",),).toEqual({
      worldId: "w1",
      title: "New",
    },);

    expect(page.scenarioId,).toBe("s2",);
  });

  test("addShot posts the shot draft to the scene endpoint", async () => {
    const calls = stubNetwork(() => scenarioTree());
    host.__USER_ID = "user-1";
    const page = ivssAuthoring();
    page.scenarioId = "s1";
    page.tree = scenarioTree();

    await page.addShot("scene-a",);

    expect(calls[0]?.url,).toBe("/api/v1/ivss/scenes/scene-a/shots",);
    expect(calls[0]?.method,).toBe("POST",);
    expect(JSON.parse(calls[0]?.body ?? "null",),).toEqual({
      startMs: 0,
      endMs: 2000,
      description: "",
      cutType: page.draftShot.cutType,
    },);
  });

  test("addFragment binds the fragment to a shot when given", async () => {
    const calls = stubNetwork(() => scenarioTree());
    host.__USER_ID = "user-1";
    const page = ivssAuthoring();
    page.scenarioId = "s1";
    page.tree = scenarioTree();

    await page.addFragment("scene-a", "shot-1",);

    expect(calls[0]?.url,).toBe("/api/v1/ivss/scenes/scene-a/fragments",);
    expect(JSON.parse(calls[0]?.body ?? "null",),).toMatchObject({
      operation: page.draftFragment.operation,
      shotId: "shot-1",
    },);
  });

  test("remove deletes the row after confirm", async () => {
    const calls = stubNetwork(() => scenarioTree());
    host.__USER_ID = "user-1";
    host.confirm = () => true;
    const page = ivssAuthoring();
    page.scenarioId = "s1";
    page.tree = scenarioTree();

    await page.remove("scene", "scene-a",);

    expect(calls[0]?.url,).toBe("/api/v1/ivss/scenes/scene-a",);
    expect(calls[0]?.method,).toBe("DELETE",);
  });

  test("failed writes surface the error and clear busy", async () => {
    stubNetwork(() => {
      throw new Error("down",);
    },);

    host.__USER_ID = "user-1";
    const page = ivssAuthoring();
    page.scenarioId = "s1";
    page.tree = scenarioTree();

    await page.addScene();

    expect(page.error,).toBe("down",);
    expect(page.busy,).toBe(false,);
  });

  test("move ignores unknown shot and fragment ids", async () => {
    const calls = stubNetwork(() => scenarioTree());
    host.__USER_ID = "user-1";
    const page = ivssAuthoring();
    page.scenarioId = "s1";
    page.tree = scenarioTree();

    await page.move("shot", "nope", 1,);
    await page.move("fragment", "nope", 1,);

    expect(calls,).toEqual([],);
  });
});
