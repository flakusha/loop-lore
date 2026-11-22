// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Focused tests for the per-user workflow selector: config defaults,
 * validated overrides, per-user isolation and the catalog route.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { workflowSelectionRoutes, } from "../routes/workflow-selection/catalog";
import { createTestDb, destroyTestDb, type TestDb, } from "../test-utils/create-test-db";
import { insertUsers, } from "../test-utils/insert-helpers";
import { getWorkflowLoader, } from "./workflow-loader";
import { hasTerminalSink, } from "./workflow-loader/workflow-validation";
import {
  getUserWorkflowSelections,
  getWorkflowCatalog,
  getWorkflowDefaults,
  resolveWorkflowForUseCase,
  type WorkflowUseCase,
} from "./workflow-selection";

const USE_CASES: WorkflowUseCase[] = [
  "image.generate",
  "image.edit",
  "video.generate",
  "audio.generate",
];

/** @param selections - workflowSelections blob to persist */
function settingsWith(selections: Record<string, string>,): string {
  return JSON.stringify({ workflowSelections: selections, },);
}

let fixture: TestDb;
let db: Kysely<DB>;
let userA: string;
let userB: string;
let bogusUser: string;
let malformedUser: string;

beforeAll(async () => {
  fixture = await createTestDb();
  db = fixture.db;
  userA = await insertUsers(db, "wf-user-a", "Workflow A", {
    settings: settingsWith({ "image.generate": "krea2-v1", "video.generate": "test:bogus", },),
  },);

  userB = await insertUsers(db, "wf-user-b", "Workflow B", {
    settings: settingsWith({ "image.generate": "noob-v1", },),
  },);

  bogusUser = await insertUsers(db, "wf-bogus", "Workflow Bogus", {
    settings: settingsWith({
      "image.generate": "test:arbitrary",
      "audio.generate": "test:audio-workflow",
    },),
  },);

  malformedUser = await insertUsers(db, "wf-malformed", "Workflow Malformed", {
    settings: "not json",
  },);
},);

afterAll(async () => {
  await destroyTestDb(fixture,);
},);

/** @param userId - identity injected into the derived auth context */
function appFor(userId: string | null,): Elysia {
  return new Elysia({ name: "test-workflow-selections", },)
    .derive(() => ({ userId, userRole: userId ? "user" : null, }))
    .use(workflowSelectionRoutes({ database: db, }, "/api/v1",),) as unknown as Elysia;
}

describe("getWorkflowDefaults", () => {
  test("every use case has a default inside its supported set", () => {
    const defaults = getWorkflowDefaults();
    expect(Object.keys(defaults,).sort(),).toEqual([...USE_CASES,].sort(),);
    for (const useCase of USE_CASES) {
      expect(defaults[useCase]!.supported.length,).toBeGreaterThan(0,);
      expect(defaults[useCase]!.supported,).toContain(defaults[useCase]!.default,);
    }
  });

  test("operator workflow placeholders are assigned to use cases", () => {
    const defaults = getWorkflowDefaults();
    expect(defaults["image.generate"].supported,).toEqual(
      expect.arrayContaining([
        "txt2img-v1",
        "sdxl-v1",
        "illustrious-v1",
        "noob-v1",
        "krea2-v1",
        "moss-v1",
        "minimax-h3-image-t2i-v1",
      ],),
    );

    expect(defaults["image.edit"].supported,).toEqual(
      expect.arrayContaining(["img2img-v1",],),
    );

    expect(defaults["video.generate"].supported,).toEqual(
      expect.arrayContaining([
        "minimax-h3-video-fl2va-v1",
        "minimax-h3-video-fl2va-opt-v1",
        "minimax-h3-video-ref2va-v1",
        "minimax-h3-video-ref2va-opt-v1",
      ],),
    );

    expect(defaults["audio.generate"].supported,).toEqual(
      expect.arrayContaining(["minimax-h3-audio-wf",],),
    );
  });
});

describe("workflow-defaults.json shipped ids", () => {
  test("every configured default and supported id is a shipped graph with a real terminal sink", async () => {
    const available = new Set(await getWorkflowLoader().listWorkflows(),);
    const defaults = getWorkflowDefaults();
    for (const useCase of USE_CASES) {
      const configured = new Set([defaults[useCase].default, ...defaults[useCase].supported,],);
      for (const id of configured) {
        expect(available.has(id,),).toBe(true,);
        const graph = await getWorkflowLoader().getRawWorkflow(id,);
        expect(graph,).not.toBeNull();
        expect(hasTerminalSink(graph!,),).toBe(true,);
      }
    }
  });
});

describe("getUserWorkflowSelections", () => {
  test("reads stored ids and ignores malformed settings or missing users", async () => {
    const selections = await getUserWorkflowSelections(db, userA,);
    expect(selections["image.generate"],).toBe("krea2-v1",);
    expect(await getUserWorkflowSelections(db, malformedUser,),).toEqual({},);
    expect(await getUserWorkflowSelections(db, "missing-user",),).toEqual({},);
  });
});

describe("resolveWorkflowForUseCase", () => {
  test("a configured stored id wins over the default", async () => {
    expect(
      await resolveWorkflowForUseCase({
        database: db,
        userId: userA,
        useCase: "image.generate",
      },),
    ).toBe("krea2-v1",);
  });

  test("unknown stored ids fall back to the config default, never through", async () => {
    const defaults = getWorkflowDefaults();
    expect(
      await resolveWorkflowForUseCase({
        database: db,
        userId: bogusUser,
        useCase: "image.generate",
      },),
    ).toBe(defaults["image.generate"].default,);

    expect(
      await resolveWorkflowForUseCase({
        database: db,
        userId: bogusUser,
        useCase: "audio.generate",
      },),
    ).toBe(defaults["audio.generate"].default,);

    expect(
      await resolveWorkflowForUseCase({
        database: db,
        userId: userA,
        useCase: "video.generate",
      },),
    ).toBe(defaults["video.generate"].default,);
  });

  test("fallback is used when no config entry exists", async () => {
    expect(
      await resolveWorkflowForUseCase({
        database: db,
        userId: userA,
        useCase: "unknown.use" as WorkflowUseCase,
        fallback: "fallback-workflow",
      },),
    ).toBe("fallback-workflow",);
  });
});

describe("getWorkflowCatalog", () => {
  test("selections are isolated per user and entries are labeled", async () => {
    const available = new Set(await getWorkflowLoader().listWorkflows(),);
    const catalogA = await getWorkflowCatalog({ database: db, userId: userA, },);
    const catalogB = await getWorkflowCatalog({ database: db, userId: userB, },);

    expect(catalogA.map((entry,) => entry.useCase),).toEqual(USE_CASES,);
    expect(catalogA.find((entry,) => entry.useCase === "image.generate")?.selected,).toBe("krea2-v1",);
    expect(catalogB.find((entry,) => entry.useCase === "image.generate")?.selected,).toBe("noob-v1",);

    for (const entry of catalogA) {
      expect(entry.supported.length,).toBeGreaterThan(0,);
      expect(entry.supported.every((option,) => available.has(option.id,)),).toBe(true,);

      // userA has an explicit but unknown video id: keep it, never a default.
      if (entry.useCase !== "video.generate") {
        expect(entry.supported.some((option,) => option.id === entry.selected),).toBe(true,);
      }

      expect(entry.supported[0]?.label,).toMatch(/^[A-Z]/,);
    }
  });
});

describe("getWorkflowCatalog fallback", () => {
  test("an unknown explicit selection is never replaced by the default", async () => {
    const defaults = getWorkflowDefaults();
    const catalog = await getWorkflowCatalog({ database: db, userId: bogusUser, },);
    const image = catalog.find((entry,) => entry.useCase === "image.generate")!;
    const audio = catalog.find((entry,) => entry.useCase === "audio.generate")!;

    expect(image.selected,).toBe("test:arbitrary",);
    expect(audio.selected,).toBe("test:audio-workflow",);
    expect(image.selected,).not.toBe(defaults["image.generate"].default,);
    expect(image.supported.some((option,) => option.id === image.selected),).toBe(false,);
    expect(audio.supported.some((option,) => option.id === audio.selected),).toBe(false,);
  });

  test("a user without a selection gets the loadable default", async () => {
    const defaults = getWorkflowDefaults();
    const catalog = await getWorkflowCatalog({ database: db, userId: malformedUser, },);
    for (const entry of catalog) {
      expect(entry.selected,).toBe(defaults[entry.useCase].default,);
      expect(entry.supported.some((option,) => option.id === entry.selected),).toBe(true,);
    }
  });
});

describe("GET /api/v1/workflow-selections", () => {
  test("returns the caller's catalog", async () => {
    const res = await appFor(userB,).handle(
      new Request("http://localhost/api/v1/workflow-selections",),
    );

    expect(res.status,).toBe(200,);
    const body = await res.json() as { useCases: Array<{ useCase: string; selected: string }> };
    expect(body.useCases,).toHaveLength(4,);
    expect(body.useCases.find((entry,) => entry.useCase === "image.generate")?.selected,).toBe(
      "noob-v1",
    );
  });

  test("rejects anonymous callers", async () => {
    const res = await appFor(null,).handle(
      new Request("http://localhost/api/v1/workflow-selections",),
    );

    expect(res.status,).toBe(401,);
  });
});
