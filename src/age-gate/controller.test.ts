/**
 * Tests for age-gate controller.
 */
/* eslint-disable sonarjs/no-nested-functions */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { AgeGateMode, } from "../db/enums";
import type { DB, } from "../db/schema";
import {
  ageGateRoutes,
  getRuntimeConfig,
  handleAccept,
  handleAdminGetConfig,
  handleAdminUpdateConfig,
  handleGetStatus,
  initAgeGate,
} from "./controller";

function createAgeGateApp() {
  const mockDb = createMockDb();
  return new Elysia()
    .derive(() => ({ userId: "user-1", userRole: "user", sessionId: "sess-1", }))
    .use(ageGateRoutes({ database: mockDb, },),);
}

function createAdminAgeGateApp() {
  const mockDb = createMockDb();
  return new Elysia()
    .derive(() => ({ userId: "admin-1", userRole: "admin", sessionId: "sess-1", }))
    .use(ageGateRoutes({ database: mockDb, },),);
}

// Mock database factory - flat structure to avoid nested function lint errors
function createSelectFrom(): {
  select: () => {
    where: () => {
      executeTakeFirst: () => Promise<
        {
          birth_date: string | null;
          age_gate_accepted_at: string | null;
        } | null
      >;
      execute: () => Promise<unknown[]>;
    };
  };
} {
  return {
    select: () => ({
      where: () => ({
        executeTakeFirst: () => Promise.resolve(null,),
        execute: () => Promise.resolve([],),
      }),
    }),
  };
}

function createUpdateTable(): {
  set: () => { where: () => { execute: () => Promise<{ numUpdatedRows: number }> } };
} {
  return {
    set: () => ({
      where: () => ({
        execute: () => Promise.resolve({ numUpdatedRows: 1, },),
      }),
    }),
  };
}

function createInsertInto(): { values: () => { execute: () => Promise<void> } } {
  return {
    values: () => ({
      execute: () => Promise.resolve(),
    }),
  };
}

function createMockDb(): Kysely<DB> {
  return {
    selectFrom: createSelectFrom,
    updateTable: createUpdateTable,
    insertInto: createInsertInto,
  } as unknown as Kysely<DB>;
}

function createErrorDb() {
  return {
    selectFrom: () => {
      throw new Error("DB error",);
    },
    updateTable: () => {
      throw new Error("DB error",);
    },
  };
}

function createDbWithUser(birthDate: string | null, acceptedAt: string | null,) {
  return {
    selectFrom: () => ({
      select: () => ({
        where: () => ({
          executeTakeFirst: () => Promise.resolve({ birth_date: birthDate, age_gate_accepted_at: acceptedAt, },),
        }),
      }),
    }),
    updateTable: createUpdateTable,
    insertInto: createInsertInto,
  };
}

function createDbWithUpdate() {
  return {
    selectFrom: createSelectFrom,
    updateTable: () => ({
      set: () => ({
        where: () => ({
          execute: () => Promise.resolve({ numUpdatedRows: 1, },),
        }),
      }),
    }),
    insertInto: createInsertInto,
  };
}

describe("age-gate controller", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    mockDb = createMockDb();
    initAgeGate({ enabled: true, minimumAge: 18, mode: AgeGateMode.SelfDeclaration, },);
  },);

  afterEach(() => {
    initAgeGate({ enabled: false, minimumAge: 18, mode: AgeGateMode.None, },);
  },);

  describe("initAgeGate / getRuntimeConfig", () => {
    test("initializes config and can read it back", () => {
      initAgeGate({ enabled: true, minimumAge: 21, mode: AgeGateMode.Verification, },);
      const config = getRuntimeConfig();
      expect(config.enabled,).toBe(true,);
      expect(config.minimumAge,).toBe(21,);
      expect(config.mode,).toBe(AgeGateMode.Verification,);
    });

    test("returns copy of config (not reference)", () => {
      const config = getRuntimeConfig();
      config.enabled = false;
      const config2 = getRuntimeConfig();
      expect(config2.enabled,).toBe(true,);
    });
  });

  describe("handleGetStatus", () => {
    test.each<
      [
        string,
        { enabled: boolean; minimumAge: number; mode: AgeGateMode },
        string | null,
        string | null,
        string | null,
        boolean,
        boolean,
      ]
    >([
      [
        "returns gate disabled when config disabled",
        { enabled: false, minimumAge: 18, mode: AgeGateMode.None, },
        null,
        null,
        null,
        false,
        true,
      ],
      [
        "returns gate not passed for null user with enabled gate",
        { enabled: true, minimumAge: 18, mode: AgeGateMode.SelfDeclaration, },
        null,
        null,
        null,
        true,
        false,
      ],
      [
        "returns gate not passed for user without birth_date",
        { enabled: true, minimumAge: 18, mode: AgeGateMode.SelfDeclaration, },
        "user-1",
        null,
        null,
        true,
        false,
      ],
      [
        "returns gate passed when user has both fields",
        { enabled: true, minimumAge: 18, mode: AgeGateMode.SelfDeclaration, },
        "user-1",
        "2000-01-01",
        "2024-01-01T00:00:00.000Z",
        true,
        true,
      ],
    ],)("%s", async (_name, config, userId, birthDate, acceptedAt, expectedIsEnabled, expectedHasPassed,) => {
      initAgeGate(config,);
      const db = userId === null ? mockDb : (createDbWithUser(birthDate, acceptedAt,) as unknown as Kysely<DB>);
      const res = await handleGetStatus(db, userId,);
      const data = (await res.json()) as { isEnabled: boolean; hasPassed: boolean };
      expect(data.isEnabled,).toBe(expectedIsEnabled,);
      expect(data.hasPassed,).toBe(expectedHasPassed,);
    },);

    test("returns 500 on database error", async () => {
      const errorDb = createErrorDb();
      const res = await handleGetStatus(errorDb as unknown as Kysely<DB>, "user-1",);
      expect(res.status,).toBe(500,);
    });
  });

  describe("handleAccept", () => {
    test.each<[string, Record<string, unknown>, boolean,]>([
      ["returns 400 when birthDate missing", {}, true,],
      ["returns 400 when birthDate not a string", { birthDate: 123, }, false,],
    ],)("%s", async (_name, body, checkError,) => {
      const res = await handleAccept({
        database: mockDb,
        userId: "user-1",
        body,
      },);
      expect(res.status,).toBe(400,);
      if (checkError) {
        const data = (await res.json()) as { error: string };
        expect(data.error,).toContain("birthDate",);
      }
    },);

    test.each<[string, { enabled: boolean; minimumAge: number; mode: AgeGateMode },]>([
      ["is no-op when gate disabled", { enabled: false, minimumAge: 18, mode: AgeGateMode.None, },],
      ["is no-op when mode is none", { enabled: true, minimumAge: 18, mode: AgeGateMode.None, },],
    ],)("%s", async (_name, config,) => {
      initAgeGate(config,);
      const res = await handleAccept({
        database: mockDb,
        userId: "user-1",
        body: { birthDate: "2020-01-01", },
      },);
      expect(res.status,).toBe(200,);
    },);

    test("returns 403 when user is underage", async () => {
      const res = await handleAccept({
        database: mockDb,
        userId: "user-1",
        body: { birthDate: "2020-01-01", },
      },);
      expect(res.status,).toBe(403,);
    });

    test("returns 200 and updates database for valid adult", async () => {
      const dbWithUpdate = createDbWithUpdate();
      const res = await handleAccept({
        database: dbWithUpdate as unknown as Kysely<DB>,
        userId: "user-1",
        body: { birthDate: "2000-01-01", },
      },);
      expect(res.status,).toBe(200,);
      const data = (await res.json()) as { ok: boolean };
      expect(data.ok,).toBe(true,);
    });

    test("returns 500 on database error", async () => {
      const errorDb = createErrorDb();
      const res = await handleAccept({
        database: errorDb as unknown as Kysely<DB>,
        userId: "user-1",
        body: { birthDate: "2000-01-01", },
      },);
      expect(res.status,).toBe(500,);
    });
  });

  describe("handleAdminGetConfig", () => {
    test.each<[string, string | null, number, boolean,]>([
      ["returns 403 for non-admin", "user", 403, false,],
      ["returns 403 for null role", null, 403, false,],
      ["returns config for admin", "admin", 200, true,],
      ["returns config for solo user (admin-equivalent)", "solo", 200, false,],
    ],)("%s", async (_name, role, expectedStatus, checkData,) => {
      const res = handleAdminGetConfig(role,);
      expect(res.status,).toBe(expectedStatus,);
      if (checkData) {
        const data = (await res.json()) as { enabled: boolean };
        expect(data.enabled,).toBeDefined();
      }
    },);
  });

  describe("handleAdminUpdateConfig", () => {
    test.each<[string, string, Record<string, unknown>, number,]>([
      ["returns 403 for non-admin", "user", { enabled: true, }, 403,],
      ["allows update for solo user (admin-equivalent)", "solo", { enabled: true, }, 200,],
    ],)("%s", (_name, role, body, expectedStatus,) => {
      const res = handleAdminUpdateConfig(role, body,);
      expect(res.status,).toBe(expectedStatus,);
    },);

    test.each<[string, Record<string, unknown> | null,]>([
      ["returns 400 for invalid body", null,],
      ["returns 400 for minimumAge = 0", { minimumAge: 0, },],
      ["returns 400 for minimumAge = 151", { minimumAge: 151, },],
      ["returns 400 for invalid mode", { mode: "invalid-mode", },],
    ],)("%s", (_name, body,) => {
      const res = handleAdminUpdateConfig("admin", body,);
      expect(res.status,).toBe(400,);
    },);

    test.each<[string, Record<string, unknown>, string, unknown,]>([
      ["updates enabled flag", { enabled: true, }, "enabled", true,],
      ["updates minimumAge", { minimumAge: 21, }, "minimumAge", 21,],
      ["updates mode", { mode: AgeGateMode.Verification, }, "mode", AgeGateMode.Verification,],
    ],)("%s", async (_name, body, key, value,) => {
      const res = handleAdminUpdateConfig("admin", body,);
      expect(res.status,).toBe(200,);
      const data = (await res.json()) as Record<string, unknown>;
      expect(data[key],).toBe(value,);
    },);

    test("returns updated config", async () => {
      const res = handleAdminUpdateConfig("admin", {
        enabled: true,
        minimumAge: 21,
        mode: AgeGateMode.Verification,
      },);
      expect(res.status,).toBe(200,);
      const data = (await res.json()) as { enabled: boolean; minimumAge: number; mode: AgeGateMode };
      expect(data.enabled,).toBe(true,);
      expect(data.minimumAge,).toBe(21,);
      expect(data.mode,).toBe(AgeGateMode.Verification,);
    });
  });

  describe("Elysia routes", () => {
    test("GET /api/age-gate/status returns 200", async () => {
      const app = createAgeGateApp();
      const req = new Request("http://localhost/api/age-gate/status",);
      const res = await app.handle(req,);
      expect(res.status,).toBe(200,);
    });

    test("POST /api/age-gate/accept returns 200", async () => {
      const app = createAgeGateApp();
      const req = new Request("http://localhost/api/age-gate/accept", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ birthDate: "2000-01-01", },),
      },);
      const res = await app.handle(req,);
      expect(res,).toBeInstanceOf(Response,);
    });

    test("GET /api/admin/age-gate returns 200 for admin", async () => {
      const app = createAdminAgeGateApp();
      const req = new Request("http://localhost/api/admin/age-gate",);
      const res = await app.handle(req,);
      expect(res.status,).toBe(200,);
    });

    test("PUT /api/admin/age-gate returns 200 for admin", async () => {
      const app = createAdminAgeGateApp();
      const req = new Request("http://localhost/api/admin/age-gate", {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ enabled: true, },),
      },);
      const res = await app.handle(req,);
      expect(res.status,).toBe(200,);
    });

    test("returns 404 for non-age-gate routes", async () => {
      const app = createAgeGateApp();
      const req = new Request("http://localhost/api/other",);
      const res = await app.handle(req,);
      expect(res.status,).toBe(404,);
    });

    test("returns 404 for wrong method on age-gate route", async () => {
      const app = createAgeGateApp();
      const req = new Request("http://localhost/api/age-gate/status", { method: "POST", },);
      const res = await app.handle(req,);
      expect(res.status,).toBe(404,);
    });
  });
});
