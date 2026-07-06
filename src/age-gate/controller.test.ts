/**
 * Tests for age-gate controller.
 */
/* eslint-disable sonarjs/no-nested-functions */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  handleGetStatus,
  handleAccept,
  handleAdminGetConfig,
  handleAdminUpdateConfig,
  dispatch as ageGateDispatch,
  initAgeGate,
  getRuntimeConfig,
} from "./controller";
import { AgeGateMode } from "../db/enums";
import type { Kysely } from "kysely";
import type { DB } from "../db/schema";

// Mock database factory - flat structure to avoid nested function lint errors
function createSelectFrom(): {
  select: () => {
    where: () => {
      executeTakeFirst: () => Promise<{
        birth_date: string | null;
        age_gate_accepted_at: string | null;
      } | null>;
      execute: () => Promise<unknown[]>;
    };
  };
} {
  return {
    select: () => ({
      where: () => ({
        executeTakeFirst: () => Promise.resolve(null),
        execute: () => Promise.resolve([]),
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
        execute: () => Promise.resolve({ numUpdatedRows: 1 }),
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

function createMockDb() {
  return {
    selectFrom: createSelectFrom,
    updateTable: createUpdateTable,
    insertInto: createInsertInto,
  };
}

function createErrorDb() {
  return {
    selectFrom: () => {
      throw new Error("DB error");
    },
    updateTable: () => {
      throw new Error("DB error");
    },
  };
}

function createDbWithUser(birthDate: string | null, acceptedAt: string | null) {
  return {
    selectFrom: () => ({
      select: () => ({
        where: () => ({
          executeTakeFirst: () =>
            Promise.resolve({ birth_date: birthDate, age_gate_accepted_at: acceptedAt }),
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
          execute: () => Promise.resolve({ numUpdatedRows: 1 }),
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
    initAgeGate({ enabled: true, minimumAge: 18, mode: AgeGateMode.SelfDeclaration });
  });

  afterEach(() => {
    initAgeGate({ enabled: false, minimumAge: 18, mode: AgeGateMode.None });
  });

  describe("initAgeGate / getRuntimeConfig", () => {
    test("initializes config and can read it back", () => {
      initAgeGate({ enabled: true, minimumAge: 21, mode: AgeGateMode.Verification });
      const config = getRuntimeConfig();
      expect(config.enabled).toBe(true);
      expect(config.minimumAge).toBe(21);
      expect(config.mode).toBe(AgeGateMode.Verification);
    });

    test("returns copy of config (not reference)", () => {
      const config = getRuntimeConfig();
      config.enabled = false;
      const config2 = getRuntimeConfig();
      expect(config2.enabled).toBe(true);
    });
  });

  describe("handleGetStatus", () => {
    test("returns gate disabled when config disabled", async () => {
      initAgeGate({ enabled: false, minimumAge: 18, mode: AgeGateMode.None });
      const res = await handleGetStatus(mockDb as unknown as Kysely<DB>, null);
      const data = (await res.json()) as { isEnabled: boolean; hasPassed: boolean };
      expect(data.isEnabled).toBe(false);
      expect(data.hasPassed).toBe(true);
    });

    test("returns gate not passed for null user with enabled gate", async () => {
      initAgeGate({ enabled: true, minimumAge: 18, mode: AgeGateMode.SelfDeclaration });
      const res = await handleGetStatus(mockDb as unknown as Kysely<DB>, null);
      const data = (await res.json()) as { isEnabled: boolean; hasPassed: boolean };
      expect(data.isEnabled).toBe(true);
      expect(data.hasPassed).toBe(false);
    });

    test("returns gate not passed for user without birth_date", async () => {
      initAgeGate({ enabled: true, minimumAge: 18, mode: AgeGateMode.SelfDeclaration });
      const dbWithUser = createDbWithUser(null, null);
      const res = await handleGetStatus(dbWithUser as unknown as Kysely<DB>, "user-1");
      const data = (await res.json()) as { isEnabled: boolean; hasPassed: boolean };
      expect(data.isEnabled).toBe(true);
      expect(data.hasPassed).toBe(false);
    });

    test("returns gate passed when user has both fields", async () => {
      initAgeGate({ enabled: true, minimumAge: 18, mode: AgeGateMode.SelfDeclaration });
      const dbWithUser = createDbWithUser("2000-01-01", "2024-01-01T00:00:00.000Z");
      const res = await handleGetStatus(dbWithUser as unknown as Kysely<DB>, "user-1");
      const data = (await res.json()) as { isEnabled: boolean; hasPassed: boolean };
      expect(data.isEnabled).toBe(true);
      expect(data.hasPassed).toBe(true);
    });

    test("returns 500 on database error", async () => {
      const errorDb = createErrorDb();
      const res = await handleGetStatus(errorDb as unknown as Kysely<DB>, "user-1");
      expect(res.status).toBe(500);
    });
  });

  describe("handleAccept", () => {
    test("returns 400 when birthDate missing", async () => {
      const res = await handleAccept(mockDb as unknown as Kysely<DB>, "user-1", {});
      expect(res.status).toBe(400);
      const data = (await res.json()) as { error: string };
      expect(data.error).toContain("birthDate");
    });

    test("returns 400 when birthDate not a string", async () => {
      const res = await handleAccept(mockDb as unknown as Kysely<DB>, "user-1", { birthDate: 123 });
      expect(res.status).toBe(400);
    });

    test("returns 403 when user is underage", async () => {
      initAgeGate({ enabled: true, minimumAge: 18, mode: AgeGateMode.SelfDeclaration });
      const res = await handleAccept(mockDb as unknown as Kysely<DB>, "user-1", { birthDate: "2020-01-01" });
      expect(res.status).toBe(403);
    });

    test("returns 200 and updates database for valid adult", async () => {
      initAgeGate({ enabled: true, minimumAge: 18, mode: AgeGateMode.SelfDeclaration });
      const dbWithUpdate = createDbWithUpdate();
      const res = await handleAccept(dbWithUpdate as unknown as Kysely<DB>, "user-1", {
        birthDate: "2000-01-01",
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { ok: boolean };
      expect(data.ok).toBe(true);
    });

    test("is no-op when gate disabled", async () => {
      initAgeGate({ enabled: false, minimumAge: 18, mode: AgeGateMode.None });
      const res = await handleAccept(mockDb as unknown as Kysely<DB>, "user-1", { birthDate: "2020-01-01" });
      expect(res.status).toBe(200);
    });

    test("is no-op when mode is none", async () => {
      initAgeGate({ enabled: true, minimumAge: 18, mode: AgeGateMode.None });
      const res = await handleAccept(mockDb as unknown as Kysely<DB>, "user-1", { birthDate: "2020-01-01" });
      expect(res.status).toBe(200);
    });

    test("returns 500 on database error", async () => {
      initAgeGate({ enabled: true, minimumAge: 18, mode: AgeGateMode.SelfDeclaration });
      const errorDb = createErrorDb();
      const res = await handleAccept(errorDb as unknown as Kysely<DB>, "user-1", { birthDate: "2000-01-01" });
      expect(res.status).toBe(500);
    });
  });

  describe("handleAdminGetConfig", () => {
    test("returns 403 for non-admin", () => {
      const res = handleAdminGetConfig("user");
      expect(res.status).toBe(403);
    });

    test("returns 403 for null role", () => {
      const res = handleAdminGetConfig(null);
      expect(res.status).toBe(403);
    });

    test("returns config for admin", async () => {
      const res = handleAdminGetConfig("admin");
      expect(res.status).toBe(200);
      const data = (await res.json()) as { enabled: boolean };
      expect(data.enabled).toBeDefined();
    });
  });

  describe("handleAdminUpdateConfig", () => {
    test("returns 403 for non-admin", () => {
      const res = handleAdminUpdateConfig("user", { enabled: true });
      expect(res.status).toBe(403);
    });

    test("returns 400 for invalid body", () => {
      const res = handleAdminUpdateConfig("admin", null);
      expect(res.status).toBe(400);
    });

    test("returns 400 for invalid minimumAge", () => {
      const res = handleAdminUpdateConfig("admin", { minimumAge: 0 });
      expect(res.status).toBe(400);
      const res2 = handleAdminUpdateConfig("admin", { minimumAge: 151 });
      expect(res2.status).toBe(400);
    });

    test("returns 400 for invalid mode", () => {
      const res = handleAdminUpdateConfig("admin", { mode: "invalid-mode" });
      expect(res.status).toBe(400);
    });

    test("updates enabled flag", async () => {
      initAgeGate({ enabled: false, minimumAge: 18, mode: AgeGateMode.SelfDeclaration });
      const res = handleAdminUpdateConfig("admin", { enabled: true });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { enabled: boolean };
      expect(data.enabled).toBe(true);
    });

    test("updates minimumAge", async () => {
      const res = handleAdminUpdateConfig("admin", { minimumAge: 21 });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { minimumAge: number };
      expect(data.minimumAge).toBe(21);
    });

    test("updates mode", async () => {
      const res = handleAdminUpdateConfig("admin", { mode: AgeGateMode.Verification });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { mode: AgeGateMode };
      expect(data.mode).toBe(AgeGateMode.Verification);
    });

    test("returns updated config", async () => {
      const res = handleAdminUpdateConfig("admin", {
        enabled: true,
        minimumAge: 21,
        mode: AgeGateMode.Verification,
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { enabled: boolean; minimumAge: number; mode: AgeGateMode };
      expect(data.enabled).toBe(true);
      expect(data.minimumAge).toBe(21);
      expect(data.mode).toBe(AgeGateMode.Verification);
    });
  });

  describe("dispatch", () => {
    test("routes GET /api/age-gate/status to handleGetStatus", async () => {
      const req = new Request("http://localhost/api/age-gate/status");
      const res = await ageGateDispatch({
        request: req,
        database: mockDb as unknown as Kysely<DB>,
        userId: "user-1",
        userRole: "user",
      });
      expect(res).not.toBeNull();
      if (res) expect(res.status).toBe(200);
    });

    test("routes POST /api/age-gate/accept to handleAccept", async () => {
      const req = new Request("http://localhost/api/age-gate/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ birthDate: "2000-01-01" }),
      });
      const res = await ageGateDispatch({
        request: req,
        database: mockDb as unknown as Kysely<DB>,
        userId: "user-1",
        userRole: "user",
      });
      expect(res).toBeInstanceOf(Response);
    });

    test("routes GET /api/admin/age-gate to handleAdminGetConfig", async () => {
      const req = new Request("http://localhost/api/admin/age-gate");
      const res = await ageGateDispatch({
        request: req,
        database: mockDb as unknown as Kysely<DB>,
        userId: "user-1",
        userRole: "admin",
      });
      expect(res).not.toBeNull();
      if (res) expect(res.status).toBe(200);
    });

    test("routes PUT /api/admin/age-gate to handleAdminUpdateConfig", async () => {
      const req = new Request("http://localhost/api/admin/age-gate", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      });
      const res = await ageGateDispatch({
        request: req,
        database: mockDb as unknown as Kysely<DB>,
        userId: "user-1",
        userRole: "admin",
      });
      expect(res).not.toBeNull();
      if (res) expect(res.status).toBe(200);
    });

    test("returns null for non-age-gate routes", async () => {
      const req = new Request("http://localhost/api/other");
      const res = await ageGateDispatch({
        request: req,
        database: mockDb as unknown as Kysely<DB>,
        userId: "user-1",
        userRole: "user",
      });
      expect(res).toBeNull();
    });

    test("returns null for wrong method on age-gate route", async () => {
      const req = new Request("http://localhost/api/age-gate/status", { method: "POST" });
      const res = await ageGateDispatch({
        request: req,
        database: mockDb as unknown as Kysely<DB>,
        userId: "user-1",
        userRole: "user",
      });
      expect(res).toBeNull();
    });
  });
});
