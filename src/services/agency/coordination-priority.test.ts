// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { beforeEach, describe, expect, test, } from "bun:test";
import {
  __queueLength,
  __resetCoordinationState,
  drainQueuedActions,
  enqueueIfNoPlayerIntent,
  hasPlayerIntent,
  markPlayerIntentPending,
  markPlayerIntentResolved,
} from "./coordination-priority";

beforeEach(() => {
  __resetCoordinationState();
},);

describe("coordination-priority — player intent tracking", () => {
  test("starts clean", () => {
    expect(hasPlayerIntent("scene-1",),).toBe(false,);
    expect(__queueLength(),).toBe(0,);
  });

  test("mark pending makes hasPlayerIntent true", () => {
    markPlayerIntentPending("scene-1", "player-a",);
    expect(hasPlayerIntent("scene-1",),).toBe(true,);
  });

  test("mark resolved clears the flag", () => {
    markPlayerIntentPending("scene-1", "player-a",);
    markPlayerIntentResolved("scene-1", "player-a",);
    expect(hasPlayerIntent("scene-1",),).toBe(false,);
  });

  test("idempotent: repeat mark is safe", () => {
    markPlayerIntentPending("scene-1", "player-a",);
    markPlayerIntentPending("scene-1", "player-a",);
    markPlayerIntentResolved("scene-1", "player-a",);
    expect(hasPlayerIntent("scene-1",),).toBe(false,);
  });

  test("multiple actors on same scene — only one clear needed? actually all", () => {
    markPlayerIntentPending("scene-1", "player-a",);
    markPlayerIntentPending("scene-1", "player-b",);
    expect(hasPlayerIntent("scene-1",),).toBe(true,);
    markPlayerIntentResolved("scene-1", "player-a",);
    expect(hasPlayerIntent("scene-1",),).toBe(true,);
    markPlayerIntentResolved("scene-1", "player-b",);
    expect(hasPlayerIntent("scene-1",),).toBe(false,);
  });
});

describe("coordination-priority — action dispatch queue", () => {
  test("no player intent → dispatch now", () => {
    const r = enqueueIfNoPlayerIntent("scene-1", { actorId: "npc-a", payload: {}, },);
    expect(r.status,).toBe("dispatched",);
    expect(__queueLength(),).toBe(0,);
  });

  test("player intent pending → queue", () => {
    markPlayerIntentPending("scene-1", "player-a",);
    const r = enqueueIfNoPlayerIntent("scene-1", { actorId: "npc-a", payload: { kind: "trade", }, },);
    expect(r.status,).toBe("queued",);
    expect(r.reason,).toBe("player_intent_in_flight",);
    expect(__queueLength(),).toBe(1,);
  });

  test("queue drains on intent resolution", () => {
    markPlayerIntentPending("scene-1", "player-a",);
    enqueueIfNoPlayerIntent("scene-1", { actorId: "npc-a", payload: { tag: "1", }, },);
    enqueueIfNoPlayerIntent("scene-1", { actorId: "npc-b", payload: { tag: "2", }, },);
    expect(__queueLength(),).toBe(2,);

    markPlayerIntentResolved("scene-1", "player-a",);
    expect(hasPlayerIntent("scene-1",),).toBe(false,);

    const drained = drainQueuedActions("scene-1",);
    expect(drained.length,).toBe(2,);
    expect(__queueLength(),).toBe(0,);
  });

  test("drain returns actions for the requested scene only", () => {
    markPlayerIntentPending("scene-1", "p1",);
    markPlayerIntentPending("scene-2", "p2",);
    enqueueIfNoPlayerIntent("scene-1", { actorId: "n1", payload: {}, },);
    enqueueIfNoPlayerIntent("scene-2", { actorId: "n2", payload: {}, },);

    expect(drainQueuedActions("scene-1",).length,).toBe(1,);
    expect(__queueLength(),).toBe(1,);
  });

  test("post-resolution dispatch does not queue", () => {
    markPlayerIntentPending("scene-1", "player-a",);
    markPlayerIntentResolved("scene-1", "player-a",);
    const r = enqueueIfNoPlayerIntent("scene-1", { actorId: "npc-a", payload: {}, },);
    expect(r.status,).toBe("dispatched",);
  });
});
