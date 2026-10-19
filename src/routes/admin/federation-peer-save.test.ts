// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage for the split-out save module. `federation.test.ts` already drives the
 * same path end-to-end through the route (and asserts the token never leaks);
 * these tests name `savePeer` directly and pin the edge cases the route hides
 * inside its Elysia body validator.
 *
 * Nothing here is a re-implementation of the validator: every case asserts the
 * shared rejection status, never the message text.
 */
import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { PeerWorkloadClass, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import type { PeerProbeFetch, } from "../../federation/peer-health-probe";
import { createTestDb, } from "../../test-utils/create-test-db";
import { savePeer, } from "./federation-peer-save";
import { badOriginResponse, } from "./federation-shared";
import type { AdminFederationRouteOpts, } from "./federation-types";

const SECRET = "admin-fed-encryption-key-0123456789";
const REMOTE = "https://gpu.example";
const LOOPBACK = "http://127.0.0.1:4010";

/** A reachable probe: the peer's own advertisement answers. */
const REACHABLE_FETCH: PeerProbeFetch = async () => ({
  ok: true,
  status: 200,
  body: { instanceId: "peer-1", workloadClasses: [PeerWorkloadClass.Chat,], },
});

/** An unreachable probe: connection refused. `probePeerHealth` never throws. */
const UNREACHABLE_FETCH: PeerProbeFetch = async () => {
  throw new Error("connection refused",);
};

/** @returns {Config} */
function testConfig(): Config {
  return {
    federation: { enabled: true, peers: [], seeds: [], },
    byoKey: { encryptionKey: SECRET, },
  } as unknown as Config;
}

/**
 * @param db
 * @param probeFetch
 * @returns {AdminFederationRouteOpts}
 */
function optsFor(
  db: Kysely<DB>,
  probeFetch: PeerProbeFetch = REACHABLE_FETCH,
): AdminFederationRouteOpts {
  return {
    database: db,
    config: testConfig(),
    federationEnabled: true,
    encryptionKey: SECRET,
    probeFetch,
  } as unknown as AdminFederationRouteOpts;
}

describe("federation-peer-save — savePeer", () => {
  test("saves a reachable remote peer and audits the save", async () => {
    const { db, } = await createTestDb();
    const res = await savePeer(optsFor(db,), "admin-1", { origin: REMOTE, },);

    expect(res.status,).toBe(200,);
    const body = await res.json() as { peer: { state: string }; probe: { outcome: string } };
    expect(body.probe.outcome,).toBe("reachable",);
    expect(body.peer.state,).toBe("trusted",);

    const peers = await db.selectFrom("mesh_peers",).selectAll().execute();
    expect(peers,).toHaveLength(1,);

    const audits = await db.selectFrom("log_entries",).selectAll().where(
      "event_type",
      "=",
      "federation.peer_saved",
    ).execute();

    expect(audits,).toHaveLength(1,);
    await db.destroy();
  });

  test("stores an unreachable peer pending, never trusted", async () => {
    const { db, } = await createTestDb();
    const res = await savePeer(optsFor(db, UNREACHABLE_FETCH,), "admin-1", { origin: REMOTE, },);

    expect(res.status,).toBe(200,);
    const body = await res.json() as { peer: { state: string } };
    expect(body.peer.state,).toBe("pending",);
    await db.destroy();
  });

  test("a shared token is refused with no encryption key configured", async () => {
    const { db, } = await createTestDb();
    const opts = optsFor(db,);
    const mutable = opts as { encryptionKey: string };
    mutable.encryptionKey = "";

    const res = await savePeer(opts, "admin-1", { origin: LOOPBACK, sharedToken: "s", },);

    expect(res.status,).toBe(400,);
    const body = await res.json() as { data?: { reason?: string } };
    expect(body.data?.reason,).toBe("missing_encryption_key",);
    await db.destroy();
  });

  test("an instance kind outside the enum is refused", async () => {
    const { db, } = await createTestDb();
    const res = await savePeer(optsFor(db,), "admin-1", { origin: REMOTE, instanceKind: "nope", },);

    expect(res.status,).toBe(400,);
    await db.destroy();
  });

  test("a duplicate origin is refused by the registry validator", async () => {
    const { db, } = await createTestDb();
    expect((await savePeer(optsFor(db,), "admin-1", { origin: REMOTE, },)).status,).toBe(200,);
    expect((await savePeer(optsFor(db,), "admin-1", { origin: REMOTE, },)).status,).toBe(400,);
    await db.destroy();
  });

  test("applies the per-peer probe trust override from config", async () => {
    const { db, } = await createTestDb();
    const opts = optsFor(db,);
    opts.config.federation.peers = [{ origin: REMOTE, trust: { caBundle: "pem-data", }, },];

    const res = await savePeer(opts, "admin-1", { origin: REMOTE, },);
    expect(res.status,).toBe(200,);
    await db.destroy();
  });

  test("never echoes the shared token in the raw response", async () => {
    const { db, } = await createTestDb();
    const res = await savePeer(optsFor(db,), "admin-1", { origin: LOOPBACK, sharedToken: "super-secret-token", },);

    expect(res.status,).toBe(200,);
    const raw = await res.text();
    expect(raw,).not.toContain("super-secret-token",);
    expect(raw,).not.toContain("sharedToken",);
    expect(raw,).toContain("hasSharedToken",);
    await db.destroy();
  });
});

describe("federation-peer-save — badOriginResponse", () => {
  test("is a 400 BadRequest envelope", async () => {
    const res = badOriginResponse();

    expect(res.status,).toBe(400,);
    const body = await res.json() as { code?: string };
    expect(body.code,).toBe("BAD_REQUEST",);
  });
});
