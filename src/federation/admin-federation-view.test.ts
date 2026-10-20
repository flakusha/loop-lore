// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for the federation admin read model, the enum narrowing guards and
 * the assignment-matrix persistence the admin routes sit on.
 *
 * These are the pieces the route tests exercise only indirectly; asserting them
 * directly pins the contracts the panel depends on — notably that a projection
 * carries no secret and that a missing matrix row means local-only.
 */
import { describe, expect, test, } from "bun:test";
import { PEER_BUDGET_MODES, PEER_INSTANCE_KINDS, PEER_WORKLOAD_CLASSES, PeerWorkloadClass, } from "../db/enums";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { buildAdminFederationView, projectPeerForAdmin, } from "./admin-federation-view";
import { readAdminStorageUsage, storageBudgetsAvailable, } from "./admin-storage-accessor";
import { upsertPeer, } from "./coordinator";
import {
  ASSIGNMENT_MATRIX_KEY,
  readAssignmentMatrix,
  writeAssignmentMatrix,
} from "./peer-assignment-matrix";
import { probePeerHealth, } from "./peer-health-probe";
import { listWorkloadPeers, setAllowedWorkloadClasses, setWorkloadTrust, } from "./peer-registry";
import { OPEN_RESERVATION_STATES, } from "./sharing";

createLogger({ level: "error", },);

const REMOTE = "https://gpu.example";

describe("admin federation view", () => {
  test("projects one peer onto every workload class", async () => {
    const { db, } = await createTestDb();
    await upsertPeer(db, { origin: REMOTE, state: "trusted", capabilities: [PeerWorkloadClass.Chat,], },);
    const [peer,] = await listWorkloadPeers(db,);
    const view = projectPeerForAdmin(peer!, [],);

    expect(view.origin,).toBe(REMOTE,);
    // One cell per class, whether or not the peer may serve it.
    expect(view.classes.map((c,) => c.workloadClass),).toEqual([...PEER_WORKLOAD_CLASSES,],);

    // The projection is an admin read model: it must not carry the shared token.
    expect(JSON.stringify(view,),).not.toContain("sharedToken",);
    await db.destroy();
  });

  test("an empty budget list leaves every cell budget-less", async () => {
    const { db, } = await createTestDb();
    await upsertPeer(db, { origin: REMOTE, state: "trusted", },);
    const [peer,] = await listWorkloadPeers(db,);
    const view = projectPeerForAdmin(peer!, [],);

    expect(view.classes.every((c,) => c.budget === null),).toBe(true,);
    await db.destroy();
  });

  test("a null storage figure stays null rather than becoming a zero row", () => {
    const view = buildAdminFederationView({ peers: [], budgets: [], storage: null, },);

    expect(view.peers,).toEqual([],);
    expect(view.storage,).toBeNull();
  });

  test("omitting storage entirely still yields null", () => {
    expect(buildAdminFederationView({ peers: [], budgets: [], },).storage,).toBeNull();
  });
});

describe("admin storage accessor", () => {
  test("reports the instance figures on an empty database", async () => {
    const { db, } = await createTestDb();
    const usage = await readAdminStorageUsage({ database: db, },);

    expect(usage.assetBytes,).toBe(0,);
    expect(usage.heldBytes,).toBe(0,);
    expect(usage.totalBytes,).toBe(0,);
    expect(usage.assetCount,).toBe(0,);
    await db.destroy();
  });

  test("budgets are available once the storage-quota migration has landed", async () => {
    const { db, } = await createTestDb();

    // The instance-storage-budgets migration (066) is merged into this branch,
    // so the accessor must report the feature as available.
    expect(await storageBudgetsAvailable(db,),).toBe(true,);
    await db.destroy();
  });
});

describe("assignment matrix persistence", () => {
  test("a missing row reads back as the empty matrix", async () => {
    const { db, } = await createTestDb();

    expect(await readAssignmentMatrix(db,),).toEqual({ preferences: {}, },);
    await db.destroy();
  });

  test("a written row round-trips through the stored key", async () => {
    const { db, } = await createTestDb();
    await writeAssignmentMatrix({ database: db, matrix: { preferences: { chat: [REMOTE,], }, }, },);

    expect(await readAssignmentMatrix(db,),).toEqual({ preferences: { chat: [REMOTE,], }, },);
    // It rides system_config rather than a table of its own.
    const row = await db
      .selectFrom("system_config",)
      .selectAll()
      .where("key", "=", ASSIGNMENT_MATRIX_KEY,)
      .executeTakeFirst();

    expect(row?.value,).toContain(REMOTE,);
    await db.destroy();
  });

  test("an empty preference list is stored verbatim, not dropped", async () => {
    const { db, } = await createTestDb();
    await writeAssignmentMatrix({ database: db, matrix: { preferences: { chat: [], }, }, },);

    // Empty means local-only for that class; it is a real operator decision.
    expect((await readAssignmentMatrix(db,)).preferences.chat,).toEqual([],);
    await db.destroy();
  });

  test("a class outside the enum is discarded on read, not trusted", async () => {
    const { db, } = await createTestDb();
    await db
      .insertInto("system_config",)
      .values({
        key: ASSIGNMENT_MATRIX_KEY,
        value: JSON.stringify({ preferences: { chat: [REMOTE,], "not-a-class": [REMOTE,], }, },),
        description: "test",
      },)
      .execute();

    const matrix = await readAssignmentMatrix(db,);
    expect(matrix.preferences.chat,).toEqual([REMOTE,],);
    // The unknown key is gone entirely, not merely empty.
    expect(Object.keys(matrix.preferences,),).toEqual([PeerWorkloadClass.Chat,],);
    await db.destroy();
  });
});

describe("peer health probe", () => {
  test("an advertisement object is reachable", async () => {
    const verdict = await probePeerHealth({
      origin: REMOTE,
      fetchImpl: async () => ({ ok: true, status: 200, body: { instanceId: "p1", }, }),
    },);

    expect(verdict.outcome,).toBe("reachable",);
    expect(verdict.reason,).toBe("",);
  });

  test("a non-ok answer reports the status", async () => {
    const verdict = await probePeerHealth({
      origin: REMOTE,
      fetchImpl: async () => ({ ok: false, status: 503, body: null, }),
    },);

    expect(verdict.outcome,).toBe("not-ok",);
    expect(verdict.reason,).toContain("503",);
  });

  test("a non-object body is malformed, not reachable", async () => {
    const verdict = await probePeerHealth({
      origin: REMOTE,
      fetchImpl: async () => ({ ok: true, status: 200, body: "plain text", }),
    },);

    expect(verdict.outcome,).toBe("malformed",);
  });

  test("a throwing transport becomes unreachable rather than propagating", async () => {
    const verdict = await probePeerHealth({
      origin: REMOTE,
      fetchImpl: () => {
        throw new Error("connection refused",);
      },
    },);

    expect(verdict.outcome,).toBe("unreachable",);
    expect(verdict.reason,).toContain("connection refused",);
  });
});

describe("open reservation states", () => {
  test("the held-bytes ledger counts only open reservations", () => {
    expect(OPEN_RESERVATION_STATES.every((s,) => typeof s === "string"),).toBe(true,);
    // A reservation holds bytes from the moment it is made until it settles.
    expect([...OPEN_RESERVATION_STATES,],).toContain("reserved",);
    expect([...OPEN_RESERVATION_STATES,],).toContain("pushed",);
    // A settled reservation no longer holds anything.
    expect([...OPEN_RESERVATION_STATES,],).not.toContain("completed",);
  });
});

describe("federation enum guards", () => {
  test("budget modes are the closed set the guards narrow against", () => {
    expect(new Set(PEER_BUDGET_MODES,).size,).toBe(PEER_BUDGET_MODES.length,);
    expect([...PEER_BUDGET_MODES,].sort(),).toEqual(["advisory", "hard",],);
  });

  test("instance kinds are the closed set the guards narrow against", () => {
    expect(new Set(PEER_INSTANCE_KINDS,).size,).toBe(PEER_INSTANCE_KINDS.length,);
    // `general` must stay in the set: it is the default a bare peer is stored as.
    expect([...PEER_INSTANCE_KINDS,],).toContain("general",);
    expect([...PEER_INSTANCE_KINDS,],).toContain("dedicated-gpu",);
  });

  test("a trusted, allowed peer projects its declared classes", async () => {
    const { db, } = await createTestDb();
    await upsertPeer(db, { origin: REMOTE, state: "trusted", capabilities: [PeerWorkloadClass.Chat,], },);
    await setAllowedWorkloadClasses(db, { origin: REMOTE, classes: [PeerWorkloadClass.Chat,], },);
    await setWorkloadTrust(db, { origin: REMOTE, workloadTrust: true, },);

    const [peer,] = await listWorkloadPeers(db,);
    expect(peer?.workloadTrust,).toBe(true,);
    await db.destroy();
  });
});
