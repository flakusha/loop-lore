// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Story turn-order component tests.
 *
 * Production calls `apiFetch` (chain: apiFetch → feFetch → safeFetch →
 * globalThis.fetch), so fetch is stubbed and the real chain runs — same
 * approach as chat-settings.test.ts / chat-participants.test.ts. Deterministic:
 * the snapshot fixtures use `round_robin` (the `initiative` strategy's next
 * pick is Math.random-based and is never asserted).
 */

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { TurnOrderSlot, } from "./chat-types/participants-state";
import { mergeInitiative, storyQueue, } from "./story-turn-order";
import type { InitiativeRow, StoryTurnOrderComponent, StoryTurnSlot, } from "./story-turn-order";

interface FetchCall {
  url: string;
  method: string;
  body: string | null;
}

const calls: FetchCall[] = [];
let responders: Record<string, () => Response> = {};
const originalFetch = globalThis.fetch;

const SNAPSHOT = {
  turnOrder: {
    strategy: "round_robin",
    currentActorId: "a1",
    nextActorId: "a2",
    order: [
      {
        actor_id: "a2",
        display_name: "Beta",
        actor_type: "character",
        talkativity: 5,
        isCurrent: false,
        isNext: true,
      },
      {
        actor_id: "a1",
        display_name: "Alpha",
        actor_type: "narrator",
        talkativity: 5,
        isCurrent: true,
        isNext: false,
      },
      {
        actor_id: "a3",
        display_name: "Gamma",
        actor_type: "npc",
        talkativity: 5,
        isCurrent: false,
        isNext: false,
      },
    ],
  },
};

const PARTICIPANTS = [
  { actor_id: "a1", initiative: 2, },
  { actor_id: "a2", initiative: 7, },
  { actor_id: "a3", initiative: null, },
];

function stubDefault(): void {
  responders = {
    "GET /api/v1/chats/chat-1/turn-order": () => Response.json(SNAPSHOT,),
    "GET /api/v1/chats/chat-1/participants": () => Response.json(PARTICIPANTS,),
  };
}

function makeComponent(): StoryTurnOrderComponent {
  const factory = (globalThis as { storyTurnOrder?: () => StoryTurnOrderComponent }).storyTurnOrder;
  if (!factory) { throw new Error("storyTurnOrder factory not registered",); }
  return factory();
}

function slot(actorId: string, overrides: Partial<TurnOrderSlot> = {},): TurnOrderSlot {
  return {
    actor_id: actorId,
    display_name: actorId,
    actor_type: "character",
    talkativity: 5,
    isCurrent: false,
    isNext: false,
    ...overrides,
  };
}

beforeEach(() => {
  calls.length = 0;
  stubDefault();
  (globalThis as Record<string, unknown>).Alpine = {
    store: (_name: string,) => ({ currentChat: { id: "chat-1", }, }),
  };

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit,) => {
    const url = input instanceof Request ? input.url : String(input,);
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: typeof init?.body === "string" ? init.body : null, },);
    const respond = responders[`${method} ${url}`];
    return respond ? respond() : new Response("{}", { status: 200, },);
  }) as typeof fetch;
},);

afterEach(() => {
  globalThis.fetch = originalFetch;
},);

describe("mergeInitiative", () => {
  test("joins initiative by actor id, null when unmatched", () => {
    const merged = mergeInitiative(
      [slot("a1",), slot("a3",), slot("zz",),],
      PARTICIPANTS as InitiativeRow[],
    );

    expect(merged[0]?.initiative,).toBe(2,);
    expect(merged[1]?.initiative,).toBeNull();
    expect(merged[2]?.initiative,).toBeNull();
  });

  test("empty inputs stay empty", () => {
    expect(mergeInitiative([], [],),).toEqual([],);
  });
});

describe("storyQueue", () => {
  const merged: StoryTurnSlot[] = [
    { ...slot("a2",), initiative: 7, },
    { ...slot("a1",), initiative: 2, },
    { ...slot("a3",), initiative: null, },
  ];

  test("rotates acting-first at the current actor", () => {
    const queue = storyQueue(merged, "a1",);
    expect(queue.map((s,) => s.actor_id),).toEqual(["a1", "a3", "a2",],);
  });

  test("falls back to snapshot order without a current actor", () => {
    expect(storyQueue(merged, null,).map((s,) => s.actor_id),).toEqual(["a2", "a1", "a3",],);
    expect(storyQueue(merged, "ghost",).map((s,) => s.actor_id),).toEqual(["a2", "a1", "a3",],);
  });

  test("empty order stays empty", () => {
    expect(storyQueue([], "a1",),).toEqual([],);
  });
});

describe("storyTurnOrder component", () => {
  test("load() fetches snapshot + participants and builds the queue", async () => {
    const component = makeComponent();
    await component.load();

    expect(component.snapshot?.strategy,).toBe("round_robin",);
    expect(component.snapshot?.currentActorId,).toBe("a1",);
    expect(component.nextIsExact,).toBe(true,);
    expect(component.queue.map((s,) => s.actor_id),).toEqual(["a1", "a3", "a2",],);
    expect(component.queue[0]?.initiative,).toBe(2,);
    expect(component.queue[1]?.initiative,).toBeNull();
    expect(calls.some((c,) => c.url === "/api/v1/chats/chat-1/turn-order"),).toBe(true,);
    expect(calls.some((c,) => c.url === "/api/v1/chats/chat-1/participants"),).toBe(true,);
  });

  test("null snapshot renders empty without throwing", async () => {
    responders["GET /api/v1/chats/chat-1/turn-order"] = () => Response.json({ turnOrder: null, },);
    const component = makeComponent();
    await component.load();

    expect(component.snapshot,).toBeNull();
    expect(component.queue,).toEqual([],);
    expect(component.strategy,).toBeNull();
  });

  test("fetch failure keeps prior state and resolves", async () => {
    responders["GET /api/v1/chats/chat-1/turn-order"] = () => {
      throw new Error("down",);
    };

    const component = makeComponent();
    component.snapshot = SNAPSHOT.turnOrder;
    await component.load();

    expect(component.snapshot,).toEqual(SNAPSHOT.turnOrder,);
  });

  test("stepWith posts story/step with forceActorId and reloads", async () => {
    const component = makeComponent();
    await component.load();
    await component.stepWith("a2",);

    const step = calls.find((c,) => c.url === "/api/v1/chats/chat-1/story/step");
    expect(step?.method,).toBe("POST",);
    expect(step?.body,).toBe(JSON.stringify({ forceActorId: "a2", },),);
    const turnOrderGets = calls.filter((c,) => c.url === "/api/v1/chats/chat-1/turn-order" && c.method === "GET");
    expect(turnOrderGets.length,).toBeGreaterThanOrEqual(2,);
  });

  test("stepWith is a no-op while busy", async () => {
    const component = makeComponent();
    component.busy = true;
    await component.stepWith("a2",);

    expect(calls.some((c,) => c.url === "/api/v1/chats/chat-1/story/step"),).toBe(false,);
  });

  test("stepWith failure dispatches an error toast", async () => {
    responders["POST /api/v1/chats/chat-1/story/step"] = () => Response.json({ message: "nope", }, { status: 403, },);
    const component = makeComponent();
    const toasts: { type?: string; message?: string }[] = [];
    (component as { $dispatch?: unknown }).$dispatch = (
      event: string,
      detail: { type?: string; message?: string },
    ) => {
      if (event === "show-toast") { toasts.push(detail,); }
    };

    await component.stepWith("a2",);

    expect(toasts[0]?.type,).toBe("error",);
    expect(component.busy,).toBe(false,);
  });

  test("setInitiative PUTs the value and refreshes the snapshot", async () => {
    const component = makeComponent();
    await component.load();
    const putCount = calls.filter((c,) => c.method === "PUT").length;
    await component.setInitiative("a2", 9,);

    const put = calls.find((c,) => c.url === "/api/v1/chats/chat-1/participants/a2" && c.method === "PUT");
    expect(put?.body,).toBe(JSON.stringify({ initiative: 9, },),);
    expect(component.initiativeRows.find((r,) => r.actor_id === "a2")?.initiative,).toBe(9,);
    expect(calls.filter((c,) => c.method === "PUT").length,).toBe(putCount + 1,);
  });

  test("setInitiative failure dispatches an error toast", async () => {
    responders["PUT /api/v1/chats/chat-1/participants/a2"] = () => new Response("{}", { status: 400, },);
    const component = makeComponent();
    const toasts: { type?: string }[] = [];
    (component as { $dispatch?: unknown }).$dispatch = (event: string, detail: { type?: string },) => {
      if (event === "show-toast") { toasts.push(detail,); }
    };

    await component.setInitiative("a2", 9,);

    expect(toasts[0]?.type,).toBe("error",);
  });

  test("load() without an active chat is a no-op", async () => {
    (globalThis as Record<string, unknown>).Alpine = { store: () => ({}), };
    const component = makeComponent();
    await component.load();

    expect(calls,).toEqual([],);
    expect(component.snapshot,).toBeNull();
  });
});
