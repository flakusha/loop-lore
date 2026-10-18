// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Peer health + load registry: latency EWMA, per-(peer, class) circuit, and
 * in-flight bookkeeping that returns to zero on every outcome path.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { PeerWorkloadClass, } from "../db/enums";
import {
  beginPeerAttempt,
  configurePeerConcurrency,
  endPeerAttempt,
  peerCircuitOpen,
  peerLoad,
  recordPeerHealthMiss,
  recordPeerOutcome,
  resetPeerHealth,
  runPeerAttempt,
} from "./peer-health";

const ORIGIN = "https://gpu.example";
const realNow = Date.now;
let now = 1_000_000;

beforeEach(() => {
  resetPeerHealth();
  now = 1_000_000;
  Date.now = () => now;
},);

afterEach(() => {
  Date.now = realNow;
},);

describe("latency EWMA", () => {
  test("the first sample seeds the average outright — no division by zero", () => {
    expect(peerLoad({ origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, },).ewmaLatencyMs,).toBeNull();
    recordPeerOutcome({ origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, ok: true, latencyMs: 250, },);
    expect(peerLoad({ origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, },).ewmaLatencyMs,).toBe(250,);
  });

  test("converges toward a repeated latency", () => {
    for (let sample = 0; sample < 40; sample += 1) {
      recordPeerOutcome({ origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, ok: true, latencyMs: 10, },);
    }

    const ewma = peerLoad({ origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, },).ewmaLatencyMs;
    expect(ewma,).not.toBeNull();
    expect(ewma!,).toBeLessThan(10.01,);
    expect(ewma!,).toBeGreaterThan(9.9,);
  });

  test("is keyed by (origin, class) — an image latency never moves the chat average", () => {
    recordPeerOutcome({ origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, ok: true, latencyMs: 20, },);
    recordPeerOutcome({ origin: ORIGIN, workloadClass: PeerWorkloadClass.Image, ok: true, latencyMs: 900, },);

    expect(peerLoad({ origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, },).ewmaLatencyMs,).toBe(20,);
    expect(peerLoad({ origin: ORIGIN, workloadClass: PeerWorkloadClass.Image, },).ewmaLatencyMs,).toBe(900,);
  });
});

describe("in-flight load", () => {
  test("reports in-flight count, the configured limit and the remaining headroom", () => {
    configurePeerConcurrency({ origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, maxConcurrency: 2, },);
    beginPeerAttempt({ origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, },);
    beginPeerAttempt({ origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, },);

    expect(peerLoad({ origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, },),).toMatchObject({
      inFlight: 2,
      maxConcurrency: 2,
      headroom: 0,
    },);

    endPeerAttempt({ origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, },);
    expect(peerLoad({ origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, },).headroom,).toBe(1,);
  });

  test("an unconfigured limit means unlimited headroom, not zero", () => {
    expect(peerLoad({ origin: ORIGIN, workloadClass: PeerWorkloadClass.Aux, },),).toMatchObject({
      maxConcurrency: null,
      headroom: null,
    },);
  });

  test("a successful attempt releases its slot", async () => {
    await runPeerAttempt({ origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, }, async () => "ok",);
    expect(peerLoad({ origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, },).inFlight,).toBe(0,);
  });

  test("a throwing handler releases its slot too — a leaked slot shrinks headroom forever", async () => {
    await expect(
      runPeerAttempt({ origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, }, async () => {
        throw new Error("peer exploded",);
      },),
    ).rejects.toThrow("peer exploded",);

    expect(peerLoad({ origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, },).inFlight,).toBe(0,);
  });

  test("records the outcome of a failing attempt, not just a successful one", async () => {
    await expect(
      runPeerAttempt({ origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, }, async () => {
        throw new Error("boom",);
      },),
    ).rejects.toThrow();

    const snapshot = peerLoad({ origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, },);
    expect(snapshot.ewmaLatencyMs,).not.toBeNull();
  });
});

describe("per-(peer, class) circuit", () => {
  test("opens after the configured failure count and stays closed below it", () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      recordPeerOutcome({ origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, ok: false, latencyMs: 12, },);
    }

    expect(peerCircuitOpen({ origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, },),).toBe(false,);
    recordPeerOutcome({ origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, ok: false, latencyMs: 12, },);
    expect(peerCircuitOpen({ origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, },),).toBe(true,);
  });

  test("a success closes it again once the cooldown has elapsed", () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      recordPeerOutcome({ origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, ok: false, latencyMs: 12, },);
    }

    expect(peerCircuitOpen({ origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, },),).toBe(true,);

    now += 60_000;
    expect(peerCircuitOpen({ origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, },),).toBe(false,);
    recordPeerOutcome({ origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, ok: true, latencyMs: 8, },);
    expect(peerCircuitOpen({ origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, },),).toBe(false,);
  });

  test("tripping the chat circuit leaves the image circuit closed", () => {
    recordPeerHealthMiss(ORIGIN, [PeerWorkloadClass.Chat,],);
    recordPeerHealthMiss(ORIGIN, [PeerWorkloadClass.Chat,],);
    recordPeerHealthMiss(ORIGIN, [PeerWorkloadClass.Chat,],);

    expect(peerCircuitOpen({ origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, },),).toBe(true,);
    expect(peerCircuitOpen({ origin: ORIGIN, workloadClass: PeerWorkloadClass.Image, },),).toBe(false,);
  });

  test("resetting drops the circuit back to closed", () => {
    recordPeerHealthMiss(ORIGIN, [PeerWorkloadClass.Chat,],);
    recordPeerHealthMiss(ORIGIN, [PeerWorkloadClass.Chat,],);
    recordPeerHealthMiss(ORIGIN, [PeerWorkloadClass.Chat,],);
    resetPeerHealth();
    expect(peerCircuitOpen({ origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, },),).toBe(false,);
    expect(peerLoad({ origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, },).ewmaLatencyMs,).toBeNull();
  });
});
