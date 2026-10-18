// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Peer routing policy: each precedence rule in isolation, the four-tier
 * tiebreak chain, stickiness retained and released, local-only when the matrix
 * row is absent, and federation-disabled forcing local for every class.
 *
 * Consumer-visible behaviour only — every assertion is about WHICH target the
 * policy picks, never about how it is wired.
 */
import { beforeEach, describe, expect, test, } from "bun:test";
import { PeerAuthMode, PeerInstanceKind, PeerLinkKind, PeerWorkloadClass, } from "../db/enums";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  beginPeerAttempt,
  configurePeerConcurrency,
  recordPeerOutcome,
  resetPeerHealth,
} from "./peer-health";
import { type WorkloadPeer, } from "./peer-registry";
import {
  peerAssignmentKey,
  type PeerAssignmentMatrix,
  peerRankComparator,
  type PeerRouteInput,
  PeerRouteReason,
  resolvePeerRoute,
  STICKY_WORKLOAD_CLASS,
} from "./peer-router";
import {
  pinWorkloadPeer,
  readWorkAssignment,
  releaseWorkAssignment,
} from "./peer-work-assignments";

const GPU = "https://gpu.example";
const CPU = "https://cpu.example";

function peer(origin: string, overrides: Partial<WorkloadPeer> = {},): WorkloadPeer {
  return {
    origin,
    state: "trusted",
    displayName: null,
    instanceKind: PeerInstanceKind.General,
    authMode: PeerAuthMode.Tls,
    linkKind: PeerLinkKind.Remote,
    workloadTrust: true,
    stickyEnabled: true,
    allowedWorkloadClasses: [PeerWorkloadClass.Chat, PeerWorkloadClass.Embedding,],
    advertisedWorkloadClasses: [PeerWorkloadClass.Chat, PeerWorkloadClass.Embedding,],
    hasSharedToken: false,
    capacityBytes: null,
    ...overrides,
  };
}

/** A matrix that permits every listed peer for the listed classes. */
function matrixFor(rows: Record<string, readonly string[]>,): PeerAssignmentMatrix {
  const preferences: Partial<Record<PeerWorkloadClass, readonly string[]>> = {};
  for (const [key, value,] of Object.entries(rows,)) {
    preferences[key as PeerWorkloadClass] = value;
  }

  return { preferences, };
}

function input(overrides: Partial<PeerRouteInput> & { peers: readonly WorkloadPeer[] },): PeerRouteInput {
  return {
    federationEnabled: true,
    workloadClass: PeerWorkloadClass.Embedding,
    matrix: matrixFor({ embedding: overrides.peers.map((entry,) => entry.origin), },),
    ...overrides,
  };
}

/** Give one peer a finite ceiling and consume `busy` in-flight slots. */
function loadPeer(origin: string, busy: number, ceiling: number,): void {
  configurePeerConcurrency({
    origin,
    workloadClass: PeerWorkloadClass.Embedding,
    maxConcurrency: ceiling,
  },);

  for (let i = 0; i < busy; i += 1) {
    beginPeerAttempt({ origin, workloadClass: PeerWorkloadClass.Embedding, },);
  }
}

/** Seed the latency EWMA. The first sample seeds it outright. */
function latencyFor(origin: string, latencyMs: number,): void {
  recordPeerOutcome({
    origin,
    workloadClass: PeerWorkloadClass.Embedding,
    ok: true,
    latencyMs,
  },);
}

describe("resolvePeerRoute — the federation-off switch", () => {
  beforeEach(() => {
    resetPeerHealth();
  },);

  test("disabled federation routes every workload class to local", () => {
    const peers = [peer(GPU,),];
    for (const workloadClass of Object.values(PeerWorkloadClass,)) {
      const decision = resolvePeerRoute(input({
        federationEnabled: false,
        workloadClass,
        peers,
        matrix: matrixFor(Object.fromEntries(Object.values(PeerWorkloadClass,).map((c,) => [c, [GPU,],]),),),
      },),);

      expect(decision.target, `${workloadClass} must stay local with federation off`,).toBe("local",);
      expect(decision.reason,).toBe(PeerRouteReason.FederationDisabled,);
    }
  });

  test("disabled federation wins even when a sticky assignment exists", () => {
    const decision = resolvePeerRoute(input({
      federationEnabled: false,
      workloadClass: PeerWorkloadClass.Chat,
      affinityKey: "session-a",
      peers: [peer(GPU,),],
      assignment: { affinityKey: "session-a", workloadClass: PeerWorkloadClass.Chat, peerOrigin: GPU, },
    },),);

    expect(decision.target,).toBe("local",);
  });
});

describe("resolvePeerRoute — exported ranking surface", () => {
  test("chat is the only sticky class", () => {
    expect(STICKY_WORKLOAD_CLASS,).toBe(PeerWorkloadClass.Chat,);
    for (const workloadClass of Object.values(PeerWorkloadClass,)) {
      expect(workloadClass === PeerWorkloadClass.Chat, `${workloadClass} stickiness`,).toBe(
        workloadClass === STICKY_WORKLOAD_CLASS,
      );
    }
  });

  test("the comparator sorts a peer list from best to worst", () => {
    loadPeer(GPU, 0, 4,);
    loadPeer(CPU, 3, 4,);
    latencyFor(GPU, 900,);
    latencyFor(CPU, 900,);

    const byRank = peerRankComparator(PeerWorkloadClass.Embedding,);

    expect([GPU, CPU,].toSorted(byRank,),).toEqual([GPU, CPU,],);
    expect([CPU, GPU,].toSorted(byRank,),).toEqual([GPU, CPU,],);
  });
});

describe("resolvePeerRoute — the assignment matrix is the per-class kill switch", () => {
  beforeEach(() => {
    resetPeerHealth();
  },);

  test("a class with no matrix row is local-only even with an eligible peer", () => {
    const decision = resolvePeerRoute(input({
      workloadClass: PeerWorkloadClass.Embedding,
      peers: [peer(GPU,),],
      matrix: matrixFor({ chat: [GPU,], },),
    },),);

    expect(decision.target,).toBe("local",);
    expect(decision.reason,).toBe(PeerRouteReason.NoMatrixRow,);
  });

  test("an empty matrix row is local-only", () => {
    const decision = resolvePeerRoute(input({
      workloadClass: PeerWorkloadClass.Embedding,
      peers: [peer(GPU,),],
      matrix: matrixFor({ embedding: [], },),
    },),);

    expect(decision.target,).toBe("local",);
    expect(decision.reason,).toBe(PeerRouteReason.NoMatrixRow,);
  });

  test("a peer outside the matrix row is dropped as not-in-matrix", () => {
    const decision = resolvePeerRoute(input({
      workloadClass: PeerWorkloadClass.Embedding,
      peers: [peer(GPU,), peer(CPU,),],
      matrix: matrixFor({ embedding: [CPU,], },),
    },),);

    expect(decision.target,).toBe("peer",);
    expect(decision.target === "peer" ? decision.peer.origin : "",).toBe(CPU,);
    expect(decision.excluded,).toEqual([{ origin: GPU, reason: "not-in-matrix", },],);
  });

  test("a peer permitted for one class is not reachable for another", () => {
    const decision = resolvePeerRoute(input({
      workloadClass: PeerWorkloadClass.Vision,
      peers: [peer(GPU,),],
      matrix: matrixFor({ embedding: [GPU,], vision: [GPU,], },),
    },),);

    expect(decision.target,).toBe("local",);
  });
});

describe("resolvePeerRoute — eligibility gates every candidate", () => {
  beforeEach(() => {
    resetPeerHealth();
  },);

  test("a suspended peer is never selected and is reported untrusted", () => {
    const decision = resolvePeerRoute(input({
      peers: [peer(GPU, { state: "suspended", },),],
    },),);

    expect(decision.target,).toBe("local",);
    expect(decision.reason,).toBe(PeerRouteReason.NoEligiblePeer,);
    expect(decision.excluded,).toEqual([{ origin: GPU, reason: "untrusted", },],);
  });

  test("a content-trusted peer without workload trust is never selected", () => {
    const decision = resolvePeerRoute(input({
      peers: [peer(GPU, { workloadTrust: false, },),],
    },),);

    expect(decision.target,).toBe("local",);
    expect(decision.excluded,).toEqual([{ origin: GPU, reason: "capability-missing", },],);
  });

  test("a class the peer declares but does not advertise is not selected", () => {
    const decision = resolvePeerRoute(input({
      peers: [peer(GPU, { advertisedWorkloadClasses: [PeerWorkloadClass.Chat,], },),],
    },),);

    expect(decision.target,).toBe("local",);
    expect(decision.excluded,).toEqual([{ origin: GPU, reason: "capability-missing", },],);
  });

  test("a circuit-open peer is excluded and a healthy peer takes the work", () => {
    for (let i = 0; i < 3; i += 1) {
      recordPeerOutcome({ origin: GPU, workloadClass: PeerWorkloadClass.Embedding, ok: false, latencyMs: 1, },);
    }

    const decision = resolvePeerRoute(input({ peers: [peer(GPU,), peer(CPU,),], },),);

    expect(decision.target === "peer" ? decision.peer.origin : "",).toBe(CPU,);
    expect(decision.excluded,).toEqual([{ origin: GPU, reason: "circuit-open", },],);
  });

  test("every candidate ineligible yields local, never undefined", () => {
    const decision = resolvePeerRoute(input({
      peers: [peer(GPU, { state: "suspended", },), peer(CPU, { workloadTrust: false, },),],
    },),);

    expect(decision.target,).toBe("local",);
    expect(decision.reason,).toBe(PeerRouteReason.NoEligiblePeer,);
  });

  test("an unknown workload class resolves local and does not throw", () => {
    const decision = resolvePeerRoute(input({
      workloadClass: "telepathy",
      peers: [peer(GPU,),],
    },),);

    expect(decision.target,).toBe("local",);
    expect(decision.reason,).toBe(PeerRouteReason.UnknownWorkloadClass,);
  });
});

describe("resolvePeerRoute — the four-tier ranking chain", () => {
  beforeEach(() => {
    resetPeerHealth();
  },);

  test("more headroom wins", () => {
    loadPeer(GPU, 0, 2,);
    loadPeer(CPU, 3, 4,);
    latencyFor(GPU, 900,);
    latencyFor(CPU, 900,);

    const decision = resolvePeerRoute(input({ peers: [peer(GPU,), peer(CPU,),], },),);

    expect(decision.target === "peer" ? decision.peer.origin : "",).toBe(GPU,);
  });

  test("an unlimited ceiling outranks a finite one at equal latency", () => {
    loadPeer(CPU, 1, 4,);
    latencyFor(GPU, 900,);
    latencyFor(CPU, 900,);

    const decision = resolvePeerRoute(input({ peers: [peer(GPU,), peer(CPU,),], },),);

    expect(decision.target === "peer" ? decision.peer.origin : "",).toBe(GPU,);
  });

  test("at equal headroom the lower latency EWMA wins", () => {
    loadPeer(GPU, 1, 4,);
    loadPeer(CPU, 1, 4,);
    latencyFor(GPU, 800,);
    latencyFor(CPU, 120,);

    const decision = resolvePeerRoute(input({ peers: [peer(GPU,), peer(CPU,),], },),);

    expect(decision.target === "peer" ? decision.peer.origin : "",).toBe(CPU,);
  });

  test("an unsampled peer sorts after a measured one at equal headroom", () => {
    loadPeer(GPU, 1, 4,);
    loadPeer(CPU, 1, 4,);
    latencyFor(CPU, 5_000,);

    const decision = resolvePeerRoute(input({ peers: [peer(GPU,), peer(CPU,),], },),);

    expect(decision.target === "peer" ? decision.peer.origin : "",).toBe(CPU,);
  });

  test("at equal headroom and latency the lexicographically smaller origin wins", () => {
    latencyFor(CPU, 300,);
    latencyFor(GPU, 300,);

    const decision = resolvePeerRoute(input({ peers: [peer(CPU,), peer(GPU,),], },),);

    expect(decision.target === "peer" ? decision.peer.origin : "",).toBe(CPU,);
  });

  test("two successive resolves with identical inputs return an identical result", () => {
    loadPeer(GPU, 1, 4,);
    loadPeer(CPU, 0, 4,);
    latencyFor(GPU, 400,);
    latencyFor(CPU, 90,);
    const first = resolvePeerRoute(input({ peers: [peer(GPU,), peer(CPU,),], },),);
    const second = resolvePeerRoute(input({ peers: [peer(GPU,), peer(CPU,),], },),);

    expect(first,).toEqual(second,);
  });
});

describe("resolvePeerRoute — chat stickiness", () => {
  beforeEach(() => {
    resetPeerHealth();
  },);

  test("a pinned chat stays on its peer even when another peer ranks better", () => {
    loadPeer(GPU, 0, 4,);
    loadPeer(CPU, 4, 4,);
    const pinned = {
      affinityKey: "session-a",
      workloadClass: PeerWorkloadClass.Chat,
      peerOrigin: CPU,
    };

    const decision = resolvePeerRoute(input({
      workloadClass: PeerWorkloadClass.Chat,
      affinityKey: "session-a",
      peers: [peer(GPU,), peer(CPU,),],
      matrix: matrixFor({ chat: [GPU, CPU,], },),
      assignment: pinned,
    },),);

    expect(decision.target === "peer" ? decision.peer.origin : "",).toBe(CPU,);
    expect(decision.reason,).toBe(PeerRouteReason.StickyAssignment,);
  });

  test("the pin is released once its peer stops being eligible", () => {
    recordPeerOutcome({ origin: CPU, workloadClass: PeerWorkloadClass.Chat, ok: false, latencyMs: 1, },);
    recordPeerOutcome({ origin: CPU, workloadClass: PeerWorkloadClass.Chat, ok: false, latencyMs: 1, },);
    recordPeerOutcome({ origin: CPU, workloadClass: PeerWorkloadClass.Chat, ok: false, latencyMs: 1, },);

    const decision = resolvePeerRoute(input({
      workloadClass: PeerWorkloadClass.Chat,
      affinityKey: "session-a",
      peers: [peer(GPU,), peer(CPU,),],
      matrix: matrixFor({ chat: [GPU, CPU,], },),
      assignment: { affinityKey: "session-a", workloadClass: PeerWorkloadClass.Chat, peerOrigin: CPU, },
    },),);

    expect(decision.target === "peer" ? decision.peer.origin : "",).toBe(GPU,);
    expect(decision.reason,).toBe(PeerRouteReason.Ranked,);
  });

  test("a stateless class ignores its stored assignment", () => {
    const decision = resolvePeerRoute(input({
      workloadClass: PeerWorkloadClass.Embedding,
      peers: [peer(GPU,), peer(CPU,),],
      assignment: {
        affinityKey: "session-a",
        workloadClass: PeerWorkloadClass.Embedding,
        peerOrigin: "https://absent.example",
      },
    },),);

    expect(decision.reason,).toBe(PeerRouteReason.Ranked,);
    expect(decision.target === "peer" ? decision.peer.origin : "",).not.toBe("https://absent.example",);
  });

  test("emptying the matrix row ends stickiness — the kill switch outranks the pin", () => {
    const decision = resolvePeerRoute(input({
      workloadClass: PeerWorkloadClass.Chat,
      affinityKey: "session-a",
      peers: [peer(GPU,),],
      matrix: matrixFor({ chat: [], },),
      assignment: { affinityKey: "session-a", workloadClass: PeerWorkloadClass.Chat, peerOrigin: GPU, },
    },),);

    expect(decision.target,).toBe("local",);
    expect(decision.reason,).toBe(PeerRouteReason.NoMatrixRow,);
  });
});

describe("peerAssignmentKey", () => {
  test("is opaque: it neither contains nor equals the affinity key", () => {
    const key = peerAssignmentKey({
      affinityKey: "chat-abc-123",
      workloadClass: PeerWorkloadClass.Chat,
      peerOrigin: GPU,
    },);

    expect(key,).not.toContain("chat-abc-123",);
    expect(key.length,).toBe(32,);
    expect(key,).toMatch(/^[0-9a-f]{32}$/,);
  });

  test("is stable for the same session and class, and differs across both", () => {
    const base = { affinityKey: "session-a", peerOrigin: GPU, };
    const first = peerAssignmentKey({ ...base, workloadClass: PeerWorkloadClass.Chat, },);

    expect(peerAssignmentKey({ ...base, workloadClass: PeerWorkloadClass.Chat, },),).toBe(first,);
    expect(peerAssignmentKey({ ...base, workloadClass: PeerWorkloadClass.Embedding, },),).not.toBe(first,);
    expect(
      peerAssignmentKey({ affinityKey: "session-b", workloadClass: PeerWorkloadClass.Chat, peerOrigin: GPU, },),
    ).not.toBe(first,);
  });
});

describe("sticky assignment store", () => {
  test("pins, reads back, and records the reassignment that replaced the pin", async () => {
    const { db, } = await createTestDb();
    await pinWorkloadPeer(db, {
      affinityKey: "session-a",
      workloadClass: PeerWorkloadClass.Chat,
      peerOrigin: CPU,
    },);

    expect(
      await readWorkAssignment(db, {
        affinityKey: "session-a",
        workloadClass: PeerWorkloadClass.Chat,
      },),
    ).toEqual({ affinityKey: "session-a", workloadClass: PeerWorkloadClass.Chat, peerOrigin: CPU, },);

    await pinWorkloadPeer(db, {
      affinityKey: "session-a",
      workloadClass: PeerWorkloadClass.Chat,
      peerOrigin: GPU,
      replaces: { previousOrigin: CPU, reason: "circuit-open", },
    },);

    expect(
      await readWorkAssignment(db, {
        affinityKey: "session-a",
        workloadClass: PeerWorkloadClass.Chat,
      },),
    ).toEqual({ affinityKey: "session-a", workloadClass: PeerWorkloadClass.Chat, peerOrigin: GPU, },);

    const row = await db
      .selectFrom("mesh_work_assignments",)
      .select(["previous_origin", "released_at", "release_reason", "assigned_at",],)
      .where("affinity_key", "=", "session-a",)
      .executeTakeFirstOrThrow();

    // The swap is recorded on the live pin: who it replaced and why. The row
    // is live, so `released_at` stays NULL — that column marks a DEAD pin.
    expect(row.previous_origin,).toBe(CPU,);
    expect(row.release_reason,).toBe("circuit-open",);
    expect(row.released_at,).toBeNull();
    expect(row.assigned_at,).not.toBeNull();
  });

  test("a released pin reads back as absent but survives as an audit row", async () => {
    const { db, } = await createTestDb();
    await pinWorkloadPeer(db, {
      affinityKey: "session-a",
      workloadClass: PeerWorkloadClass.Chat,
      peerOrigin: CPU,
    },);

    expect(
      await releaseWorkAssignment(db, {
        affinityKey: "session-a",
        workloadClass: PeerWorkloadClass.Chat,
        reason: "matrix-changed",
      },),
    ).toBe(true,);

    expect(
      await readWorkAssignment(db, {
        affinityKey: "session-a",
        workloadClass: PeerWorkloadClass.Chat,
      },),
    ).toBeNull();

    const rows = await db.selectFrom("mesh_work_assignments",).select("peer_origin",).execute();
    expect(rows.map((row,) => row.peer_origin),).toEqual([CPU,],);

    expect(
      await releaseWorkAssignment(db, {
        affinityKey: "session-a",
        workloadClass: PeerWorkloadClass.Chat,
        reason: "matrix-changed",
      },),
    ).toBe(false,);
  });

  test("pins are per-class, so one session can hold a chat pin and no embedding pin", async () => {
    const { db, } = await createTestDb();
    await pinWorkloadPeer(db, {
      affinityKey: "session-a",
      workloadClass: PeerWorkloadClass.Chat,
      peerOrigin: CPU,
    },);

    expect(
      await readWorkAssignment(db, {
        affinityKey: "session-a",
        workloadClass: PeerWorkloadClass.Embedding,
      },),
    ).toBeNull();
  });

  test("re-pinning the same peer twice never creates a second row", async () => {
    const { db, } = await createTestDb();
    for (let i = 0; i < 3; i += 1) {
      await pinWorkloadPeer(db, {
        affinityKey: "session-a",
        workloadClass: PeerWorkloadClass.Chat,
        peerOrigin: GPU,
      },);
    }

    const rows = await db.selectFrom("mesh_work_assignments",).select("peer_origin",).execute();
    expect(rows,).toHaveLength(1,);
  });
});
