// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Peer workload registry: defaults, derived link kind, save-time validation
 * and eligibility. Consumer-visible behaviour only — no wiring assertions.
 */
import { describe, expect, test, } from "bun:test";
import {
  PeerAuthMode,
  PeerInstanceKind,
  PeerLinkKind,
  PeerWorkloadClass,
} from "../db/enums";
import { createTestDb, } from "../test-utils/create-test-db";
import { listPeers, setPeerState, touchPeer, upsertPeer, } from "./coordinator";
import { isWorkloadEligible, listEligibleWorkloadPeers, } from "./peer-eligibility";
import { peerCircuitOpen, recordPeerOutcome, resetPeerHealth, } from "./peer-health";
import {
  derivedLinkKind,
  listWorkloadPeers,
  PeerWorkloadValidationError,
  savePeerWorkload,
  setAllowedWorkloadClasses,
  setWorkloadTrust,
} from "./peer-registry";
import { assertWorkloadClasses, validatePeerWorkloadSave, } from "./peer-registry-validation";
import { readPeerWorkloadToken, verifyPeerWorkloadToken, } from "./peer-workload-token";

const SECRET = "peer-workload-secret-0123456789";
const LOOPBACK = "http://127.0.0.1:4010";
const REMOTE = "https://gpu.example";

describe("peer registry defaults", () => {
  test("a peer created with defaults reads back untrusted, non-sticky, tls, no classes", async () => {
    const { db, } = await createTestDb();
    await upsertPeer(db, { origin: REMOTE, state: "trusted", },);

    const [peer,] = await listWorkloadPeers(db,);
    expect(peer?.workloadTrust,).toBe(false,);
    expect(peer?.stickyEnabled,).toBe(false,);
    expect(peer?.authMode,).toBe(PeerAuthMode.Tls,);
    expect(peer?.allowedWorkloadClasses,).toEqual([],);
    expect(peer?.instanceKind,).toBe(PeerInstanceKind.General,);
    expect(peer?.hasSharedToken,).toBe(false,);
  });

  test("a peer trusted for content is not workload-eligible until trust is granted", async () => {
    const { db, } = await createTestDb();
    await upsertPeer(db, {
      origin: REMOTE,
      state: "trusted",
      capabilities: [PeerWorkloadClass.Chat,],
    },);

    await setAllowedWorkloadClasses(db, { origin: REMOTE, classes: [PeerWorkloadClass.Chat,], },);

    expect((await listWorkloadPeers(db,))[0]?.workloadTrust,).toBe(false,);

    await setWorkloadTrust(db, { origin: REMOTE, workloadTrust: true, },);
    const peers = await listPeers(db,);
    expect(peers[0]?.workload_trust,).toBe(1,);
    expect((await listWorkloadPeers(db,))[0]?.workloadTrust,).toBe(true,);
  });

  test("setWorkloadTrust rejects an unknown origin instead of upserting it", async () => {
    const { db, } = await createTestDb();
    await expect(setWorkloadTrust(db, { origin: "https://ghost.example", workloadTrust: true, },),)
      .rejects.toThrow("unknown peer",);

    expect(await listPeers(db,),).toHaveLength(0,);
  });

  test("a malformed allowed_workload_classes cell reads back as [] rather than crashing", async () => {
    const { db, } = await createTestDb();
    await upsertPeer(db, { origin: REMOTE, state: "trusted", },);
    await db
      .updateTable("mesh_peers",)
      .set({ allowed_workload_classes: "{not json", },)
      .where("origin", "=", REMOTE,)
      .execute();

    expect((await listWorkloadPeers(db,))[0]?.allowedWorkloadClasses,).toEqual([],);
  });
});

describe("derivedLinkKind", () => {
  test("classifies all four loopback host forms", () => {
    expect(derivedLinkKind("http://127.0.0.1:3000",),).toBe("loopback",);
    expect(derivedLinkKind("http://localhost:3000",),).toBe("loopback",);
    expect(derivedLinkKind("http://[::1]:3000",),).toBe("loopback",);
    expect(derivedLinkKind("http://peer.localhost:3000",),).toBe("loopback",);
  });

  test("classifies a public host as remote", () => {
    expect(derivedLinkKind("https://peer.example",),).toBe("remote",);
  });

  test("returns null for a non-http(s) or unparseable origin instead of throwing", () => {
    expect(derivedLinkKind("ftp://127.0.0.1",),).toBeNull();
    expect(derivedLinkKind("not-a-url",),).toBeNull();
    expect(derivedLinkKind(42,),).toBeNull();
  });
});

describe("save-time validation", () => {
  test("accepts a loopback peer with a token and a remote peer without one", async () => {
    const { db, } = await createTestDb();
    const loop = await savePeerWorkload(db, {
      origin: LOOPBACK,
      sharedToken: "loop-secret",
      encryptionKey: SECRET,
      allowedWorkloadClasses: [PeerWorkloadClass.Chat, PeerWorkloadClass.Image,],
    },);

    expect(loop.linkKind,).toBe("loopback",);
    expect(loop.authMode,).toBe(PeerAuthMode.HostLocal,);
    expect(loop.hasSharedToken,).toBe(true,);

    const remote = await savePeerWorkload(db, {
      origin: REMOTE,
      encryptionKey: SECRET,
      allowedWorkloadClasses: [PeerWorkloadClass.Embedding,],
    },);

    expect(remote.linkKind,).toBe("remote",);
    expect(remote.authMode,).toBe(PeerAuthMode.Tls,);
    expect(remote.hasSharedToken,).toBe(false,);
  });

  test("rejects a non-http(s) origin", async () => {
    const { db, } = await createTestDb();
    await expect(savePeerWorkload(db, { origin: "ftp://host", encryptionKey: SECRET, },),)
      .rejects.toMatchObject({ reason: "invalid_origin", },);
  });

  test("rejects a loopback origin with no token", async () => {
    const { db, } = await createTestDb();
    await expect(savePeerWorkload(db, { origin: LOOPBACK, encryptionKey: SECRET, },),)
      .rejects.toMatchObject({ reason: "loopback_without_token", },);

    expect(await listPeers(db,),).toHaveLength(0,);
  });

  test("rejects a token on a remote origin", async () => {
    const { db, } = await createTestDb();
    await expect(
      savePeerWorkload(db, { origin: REMOTE, sharedToken: "t", encryptionKey: SECRET, },),
    ).rejects.toMatchObject({ reason: "token_on_remote_origin", },);
  });

  test("rejects an allowed_workload_classes entry outside the enum", async () => {
    const { db, } = await createTestDb();
    await expect(
      savePeerWorkload(db, {
        origin: REMOTE,
        encryptionKey: SECRET,
        allowedWorkloadClasses: ["telepathy" as never,],
      },),
    ).rejects.toMatchObject({ reason: "unknown_workload_class", },);
  });

  test("rejects a duplicate origin", async () => {
    const { db, } = await createTestDb();
    await savePeerWorkload(db, { origin: REMOTE, encryptionKey: SECRET, },);
    await expect(savePeerWorkload(db, { origin: REMOTE, encryptionKey: SECRET, },),)
      .rejects.toMatchObject({ reason: "duplicate_origin", },);

    expect(await listPeers(db,),).toHaveLength(1,);
  });

  test("rejects an auth_mode that contradicts the derived link kind", async () => {
    const { db, } = await createTestDb();
    await expect(
      savePeerWorkload(db, {
        origin: REMOTE,
        authMode: PeerAuthMode.HostLocal,
        encryptionKey: SECRET,
      },),
    ).rejects.toMatchObject({ reason: "auth_mode_mismatch", },);
  });

  test("setAllowedWorkloadClasses rejects an out-of-enum class and accepts the rest", async () => {
    const { db, } = await createTestDb();
    await upsertPeer(db, { origin: REMOTE, state: "trusted", },);
    await expect(
      setAllowedWorkloadClasses(db, { origin: REMOTE, classes: ["telepathy" as never,], },),
    ).rejects.toThrow(PeerWorkloadValidationError,);

    await setAllowedWorkloadClasses(db, { origin: REMOTE, classes: [PeerWorkloadClass.Vision,], },);
    expect((await listWorkloadPeers(db,))[0]?.allowedWorkloadClasses,).toEqual(["vision",],);
  });
});

describe("validator unit surface", () => {
  test("assertWorkloadClasses narrows a wire list to the enum members", () => {
    expect(assertWorkloadClasses(["chat", "vision",],),).toEqual([PeerWorkloadClass.Chat, PeerWorkloadClass.Vision,],);
  });

  test("assertWorkloadClasses rejects a value outside the closed enum", () => {
    expect(() => assertWorkloadClasses(["chat", "hologram",],)).toThrow(PeerWorkloadValidationError,);
  });

  test("assertWorkloadClasses rejects a non-array", () => {
    expect(() => assertWorkloadClasses("chat" as never,)).toThrow(PeerWorkloadValidationError,);
  });

  test("validatePeerWorkloadSave normalizes a minimal request to the stored defaults", () => {
    const validated = validatePeerWorkloadSave({ origin: REMOTE, },);
    expect(validated,).toEqual({
      origin: REMOTE,
      displayName: null,
      linkKind: PeerLinkKind.Remote,
      authMode: PeerAuthMode.Tls,
      instanceKind: PeerInstanceKind.General,
      allowedWorkloadClasses: [],
      workloadTrust: 0,
      stickyEnabled: 0,
      sharedToken: null,
    },);
  });

  test("validatePeerWorkloadSave derives host-local auth and loopback kind from the origin", () => {
    const validated = validatePeerWorkloadSave({ origin: LOOPBACK, sharedToken: "tok", },);
    expect(validated.authMode,).toBe(PeerAuthMode.HostLocal,);
    expect(validated.linkKind,).toBe(PeerLinkKind.Loopback,);
    expect(validated.sharedToken,).toBe("tok",);
  });

  test("an explicit host-local token on a remote origin is rejected before it is stored", () => {
    expect(() => validatePeerWorkloadSave({ origin: REMOTE, sharedToken: "tok", },)).toThrow(
      PeerWorkloadValidationError,
    );
  });

  test("validatePeerWorkloadSave never echoes the token back inside the normalized origin", () => {
    const validated = validatePeerWorkloadSave({ origin: LOOPBACK, sharedToken: "never-log-me-9f2b", },);
    expect(JSON.stringify({ origin: validated.origin, },),).not.toContain("never-log-me-9f2b",);
    expect(validated.origin,).toBe(LOOPBACK,);
  });
});

describe("shared workload token", () => {
  test("round-trips through encryptValue under the server secret", async () => {
    const { db, } = await createTestDb();
    await savePeerWorkload(db, {
      origin: LOOPBACK,
      sharedToken: "loop-secret-value",
      encryptionKey: SECRET,
    },);

    const row = await db
      .selectFrom("mesh_peers",)
      .select("shared_token_enc",)
      .where("origin", "=", LOOPBACK,)
      .executeTakeFirstOrThrow();

    expect(row.shared_token_enc,).not.toContain("loop-secret-value",);
    expect(
      await readPeerWorkloadToken(db, { origin: LOOPBACK, encryptionKey: SECRET, },),
    ).toBe("loop-secret-value",);
  });

  test("the raw token never appears in the serialized save result", async () => {
    const { db, } = await createTestDb();
    const peer = await savePeerWorkload(db, {
      origin: LOOPBACK,
      sharedToken: "never-log-me-9f2b",
      encryptionKey: SECRET,
    },);

    const serialized = JSON.stringify(peer,);
    expect(serialized,).not.toContain("never-log-me-9f2b",);
    expect(serialized,).toContain("hasSharedToken",);

    const rows = await db.selectFrom("mesh_peers",).selectAll().execute();
    expect(JSON.stringify(rows,),).not.toContain("never-log-me-9f2b",);
  });

  test("accepts the correct token and rejects wrong, empty, missing and padded ones", async () => {
    const { db, } = await createTestDb();
    await savePeerWorkload(db, {
      origin: LOOPBACK,
      sharedToken: "loop-secret-value",
      encryptionKey: SECRET,
    },);

    const opts = { origin: LOOPBACK, encryptionKey: SECRET, };

    expect(await verifyPeerWorkloadToken(db, { ...opts, presented: "loop-secret-value", },),).toBe(true,);
    expect(await verifyPeerWorkloadToken(db, { ...opts, presented: "loop-secret-valu", },),).toBe(false,);
    expect(await verifyPeerWorkloadToken(db, { ...opts, presented: "", },),).toBe(false,);
    expect(await verifyPeerWorkloadToken(db, { ...opts, presented: undefined, },),).toBe(false,);
    expect(await verifyPeerWorkloadToken(db, { ...opts, presented: " loop-secret-value", },),).toBe(false,);
  });

  test("a remote peer has no token to verify and therefore fails closed", async () => {
    const { db, } = await createTestDb();
    await upsertPeer(db, { origin: REMOTE, state: "trusted", },);
    expect(
      await verifyPeerWorkloadToken(db, {
        origin: REMOTE,
        presented: "anything",
        encryptionKey: SECRET,
      },),
    ).toBe(false,);
  });
});

describe("workload eligibility", () => {
  test("a suspended peer is ineligible while a trusted, granted, allowed+advertised peer is eligible", async () => {
    resetPeerHealth();
    const { db, } = await createTestDb();
    await savePeerWorkload(db, {
      origin: "https://blocked.example",
      encryptionKey: SECRET,
      workloadTrust: true,
      allowedWorkloadClasses: [PeerWorkloadClass.Chat,],
    },);

    await setPeerState(db, "https://blocked.example", "suspended",);

    await savePeerWorkload(db, {
      origin: REMOTE,
      encryptionKey: SECRET,
      workloadTrust: true,
      allowedWorkloadClasses: [PeerWorkloadClass.Chat,],
    },);

    await setPeerState(db, REMOTE, "trusted",);
    await touchPeer(db, REMOTE, { capabilities: [PeerWorkloadClass.Chat,], },);

    const eligible = await listEligibleWorkloadPeers(db, PeerWorkloadClass.Chat,);
    expect(eligible.map((peer,) => peer.origin),).toEqual([REMOTE,],);
  });

  test("a peer that is trusted but not workload-granted is ineligible", async () => {
    const { db, } = await createTestDb();
    await upsertPeer(db, { origin: REMOTE, state: "trusted", capabilities: ["chat",], },);
    await setAllowedWorkloadClasses(db, { origin: REMOTE, classes: [PeerWorkloadClass.Chat,], },);

    expect(await listEligibleWorkloadPeers(db, PeerWorkloadClass.Chat,),).toHaveLength(0,);
  });

  test("a class the peer never advertised is ineligible even when allowed", async () => {
    const { db, } = await createTestDb();
    await upsertPeer(db, { origin: REMOTE, state: "trusted", capabilities: ["chat",], },);
    await setWorkloadTrust(db, { origin: REMOTE, workloadTrust: true, },);
    await setAllowedWorkloadClasses(db, { origin: REMOTE, classes: [PeerWorkloadClass.Image,], },);

    expect(await listEligibleWorkloadPeers(db, PeerWorkloadClass.Image,),).toHaveLength(0,);
    expect((await listWorkloadPeers(db,))[0]?.advertisedWorkloadClasses,).toEqual(["chat",],);
  });

  test("a peer whose circuit is open for the class drops out of eligibility", async () => {
    resetPeerHealth();
    const { db, } = await createTestDb();
    await upsertPeer(db, { origin: REMOTE, state: "trusted", capabilities: ["chat",], },);
    await setWorkloadTrust(db, { origin: REMOTE, workloadTrust: true, },);
    await setAllowedWorkloadClasses(db, { origin: REMOTE, classes: [PeerWorkloadClass.Chat,], },);
    expect(await listEligibleWorkloadPeers(db, PeerWorkloadClass.Chat,),).toHaveLength(1,);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      recordPeerOutcome({ origin: REMOTE, workloadClass: PeerWorkloadClass.Chat, ok: false, latencyMs: 5, },);
    }

    expect(peerCircuitOpen({ origin: REMOTE, workloadClass: PeerWorkloadClass.Chat, },),).toBe(true,);
    expect(await listEligibleWorkloadPeers(db, PeerWorkloadClass.Chat,),).toHaveLength(0,);
  });

  test("isWorkloadEligible is a pure check on the peer view", async () => {
    const { db, } = await createTestDb();
    await upsertPeer(db, { origin: REMOTE, state: "trusted", capabilities: ["chat",], },);
    await setWorkloadTrust(db, { origin: REMOTE, workloadTrust: true, },);
    await setAllowedWorkloadClasses(db, { origin: REMOTE, classes: [PeerWorkloadClass.Chat,], },);
    const [peer,] = await listWorkloadPeers(db,);

    expect(isWorkloadEligible(peer!, PeerWorkloadClass.Chat,),).toBe(true,);
    expect(isWorkloadEligible(peer!, PeerWorkloadClass.Vision,),).toBe(false,);
  });
});
