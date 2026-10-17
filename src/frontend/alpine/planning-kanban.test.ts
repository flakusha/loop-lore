// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Board component: drag and the button fallback share one `move()` write path
 * (`POST /api/v1/plans/:id/advance`), and every attempt re-renders the board so
 * the card shows persisted state (a 409 rejection snaps back).
 */
import { afterEach, describe, expect, test, } from "bun:test";
import { planningKanban, } from "./planning-kanban";

const host = globalThis as unknown as {
  fetch: typeof fetch;
  htmx: { ajax: (verb: string, url: string, opts: { target: string; swap: string },) => void };
  document: { querySelector: (sel: string,) => unknown };
};

const realFetch = host.fetch;
const realDocument = host.document;
const realHtmx = host.htmx;

afterEach(() => {
  host.fetch = realFetch;
  host.document = realDocument;
  host.htmx = realHtmx;
},);

/** Capture advance calls + board refreshes; nothing hits the network. */
function stubNetwork(advanceStatus: number,) {
  const calls: Array<{ url: string; body: string }> = [];
  const refreshes: string[] = [];

  host.fetch = (async (input: string | URL | Request, init?: RequestInit,) => {
    calls.push({
      url: String(input,),
      body: typeof init?.body === "string" ? init.body : "",
    },);

    return new Response(JSON.stringify({ state: "doing", },), {
      status: advanceStatus,
      headers: { "Content-Type": "application/json", },
    },);
  }) as typeof fetch;

  // refreshHtmx re-issues the board root's own hx-get — mirror that contract.
  host.document = {
    querySelector: (sel: string,) =>
      sel === '[data-testid="planning-kanban"]'
        ? { getAttribute: (name: string,) => (name === "hx-get" ? "/api/v1/planning/kanban" : null), }
        : null,
  };

  host.htmx = {
    ajax: (_verb: string, url: string,) => {
      refreshes.push(url,);
    },
  };

  return { calls, refreshes, };
}

describe("planningKanban", () => {
  test("registers a global so x-data can call planningKanban()", () => {
    expect((globalThis as unknown as Record<string, unknown>).planningKanban,).toBe(planningKanban,);
  });

  test("move posts to the advance verb and re-renders the board", async () => {
    const { calls, refreshes, } = stubNetwork(200,);

    await planningKanban().move("p1", "doing",);

    expect(calls[0]?.url,).toBe("/api/v1/plans/p1/advance",);
    expect(JSON.parse(calls[0]?.body ?? "null",),).toEqual({ state: "doing", },);
    expect(refreshes,).toEqual(["/api/v1/planning/kanban",],);
  });

  test("a rejected move still re-renders, so the card snaps back", async () => {
    const { refreshes, } = stubNetwork(409,);

    await planningKanban().move("p1", "done",);

    expect(refreshes,).toEqual(["/api/v1/planning/kanban",],);
  });

  test("dragStart records the card and seeds the drag payload", () => {
    const board = planningKanban();
    const payload: Record<string, string> = {};

    board.dragStart(
      {
        dataTransfer: {
          setData: (type: string, value: string,) => {
            payload[type] = value;
          },
        },
      } as unknown as DragEvent,
      "p2",
    );

    expect(board.draggingId,).toBe("p2",);
    expect(payload["text/plain"],).toBe("p2",);
  });

  test("drop moves the dragged card into the target column", async () => {
    const { calls, refreshes, } = stubNetwork(200,);
    const board = planningKanban();
    board.draggingId = "p3";

    await board.drop(
      { preventDefault: () => {}, dataTransfer: { getData: () => "p3", }, } as unknown as DragEvent,
      "done",
    );

    expect(calls[0]?.url,).toBe("/api/v1/plans/p3/advance",);
    expect(board.draggingId,).toBeNull();
    expect(refreshes,).toEqual(["/api/v1/planning/kanban",],);
  });

  test("drop with no dragged card is a no-op", async () => {
    const { calls, refreshes, } = stubNetwork(200,);

    await planningKanban().drop(
      { preventDefault: () => {}, dataTransfer: { getData: () => "", }, } as unknown as DragEvent,
      "done",
    );

    expect(calls,).toEqual([],);
    expect(refreshes,).toEqual([],);
  });
});
