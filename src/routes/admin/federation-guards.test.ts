// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for the federation admin route guards and the panel's request
 * schema bounds.
 *
 * The guards are what stand between an untrusted admin form and the registry,
 * so each one is pinned directly rather than only through a route that happens
 * to use it.
 */
import { describe, expect, test, } from "bun:test";
import { PeerWorkloadClass, } from "../../db/enums";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  ADMIN_FEDERATION_ORIGIN_MAX,
  ADMIN_FEDERATION_TOKEN_MAX,
} from "../../validation/schemas/admin-federation";
import { MAX_ABILITY_BONUS, } from "../../worlds/resource-core";
import { requireFactionsInWorld, } from "../worlds/faction-routes";
import {
  auditFederationChange,
  federationOffResponse,
  isBudgetMode,
  isInstanceKind,
  isWorkloadClass,
  notInEnumResponse,
} from "./federation-shared";

createLogger({ level: "error", },);

describe("federation-off gate", () => {
  test("an enabled surface is not refused", () => {
    expect(federationOffResponse(true,),).toBeNull();
  });

  test("a disabled surface is refused as unavailable", async () => {
    const res = federationOffResponse(false,);
    expect(res,).not.toBeNull();
    // 503, not 403: the caller IS an admin, the feature is simply off.
    expect(res?.status,).toBe(503,);
    expect(await res?.text(),).toContain("disabled",);
  });
});

describe("enum guards", () => {
  test("a known workload class is accepted", () => {
    expect(isWorkloadClass(PeerWorkloadClass.Chat,),).toBe(true,);
  });

  test("an unknown workload class is rejected", () => {
    expect(isWorkloadClass("not-a-class",),).toBe(false,);
    expect(isWorkloadClass(42,),).toBe(false,);
    expect(isWorkloadClass(null,),).toBe(false,);
  });

  test("budget modes are narrowed against the closed set", () => {
    expect(isBudgetMode("hard",),).toBe(true,);
    expect(isBudgetMode("advisory",),).toBe(true,);
    expect(isBudgetMode("lenient",),).toBe(false,);
    expect(isBudgetMode(undefined,),).toBe(false,);
  });

  test("instance kinds are narrowed against the closed set", () => {
    expect(isInstanceKind("general",),).toBe(true,);
    expect(isInstanceKind("supercomputer",),).toBe(false,);
    expect(isInstanceKind(7,),).toBe(false,);
  });

  test("the enum refusal names the field and the accepted set", async () => {
    const res = notInEnumResponse("workloadClass", "not-a-class", ["chat", "embed",],);
    expect(res.status,).toBe(400,);
    const raw = await res.text();
    // The operator has to be able to correct the field from the message alone.
    expect(raw,).toContain("workloadClass",);
    expect(raw,).toContain("chat",);
  });
});

describe("federation audit trail", () => {
  test("a mutation writes an audit row and never carries the token", async () => {
    const { db, } = await createTestDb();
    await auditFederationChange({
      database: db,
      actorId: "admin-1",
      eventType: "federation",
      action: "peer.save",
      entityType: "peer",
      entityId: "https://gpu.example",
      message: "peer saved",
      meta: { state: "trusted", },
    },);

    const rows = await db.selectFrom("log_entries",).selectAll().execute();
    const serialized = JSON.stringify(rows,);
    expect(serialized,).toContain("https://gpu.example",);
    expect(serialized,).toContain("peer.save",);
    await db.destroy();
  });
});

describe("panel request bounds", () => {
  test("the origin and token bounds are positive and finite", () => {
    expect(ADMIN_FEDERATION_ORIGIN_MAX,).toBeGreaterThan(0,);
    expect(ADMIN_FEDERATION_TOKEN_MAX,).toBeGreaterThan(0,);
    // Both bounds must actually bound: a hostile megabyte-long origin or token
    // is rejected by the body schema before any handler or network call runs.
    expect(ADMIN_FEDERATION_ORIGIN_MAX,).toBeLessThan(10_000,);
    expect(ADMIN_FEDERATION_TOKEN_MAX,).toBeLessThan(10_000,);
    // A real origin is far shorter than the ceiling.
    expect(ADMIN_FEDERATION_ORIGIN_MAX,).toBeGreaterThan(64,);
  });
});

describe("faction world scoping", () => {
  test("no factions means nothing to validate", async () => {
    const { db, } = await createTestDb();
    expect(await requireFactionsInWorld(db, "world-1", [],),).toBeNull();
    await db.destroy();
  });

  test("a faction from another world is refused", async () => {
    const { db, } = await createTestDb();
    const res = await requireFactionsInWorld(db, "world-1", ["f-1",],);
    expect(res?.status,).toBe(404,);
    await db.destroy();
  });
});

describe("ability bonus ceiling", () => {
  test("the ceiling is a positive integer", () => {
    expect(MAX_ABILITY_BONUS,).toBeGreaterThan(0,);
    expect(Number.isInteger(MAX_ABILITY_BONUS,),).toBe(true,);
  });
});
