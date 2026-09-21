// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, describe, expect, mock, test, } from "bun:test";
import {
  actorEntitiesFactory,
  type ActorEntitiesState,
  type EntityKind,
  stateFromKind,
} from "./actor-entities";

// ── Mock ../htmx (must precede importing ./actor-entities) ──
type ApiFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;
let calls: { url: string; opts: RequestInit }[] = [];
let handler: ApiFetchMock = async () => Response.json({ data: [], },);

mock.module("./htmx", () => ({
  apiFetch: ((url: string, opts?: RequestInit,) => {
    calls.push({ url, opts: opts ?? {}, },);
    return handler(url, opts,);
  }) satisfies ApiFetchMock,
}),);
/** Drive the microtask queue through several cycles so async `load()` chains
 * resolve before assertions run. */
const flush = async (): Promise<void> => {
  for (let i = 0; i < 25; i++) {
    const { promise, resolve, } = Promise.withResolvers<void>();
    queueMicrotask(() => {
      resolve();
    },);
    await promise;
  }
};

const baseState = (kind: EntityKind = "notes", actorId: string = "actor-1",): ActorEntitiesState => {
  const state = stateFromKind(kind,);
  state._entActorId = actorId;
  return state;
};

afterEach(() => {
  handler = async () => Response.json({ data: [], },);
},);

describe("actorEntitiesFactory", () => {
  test("returns a state bound to the kind + actor", async () => {
    handler = async (url: string,) => {
      if (url === "/api/v1/actors/actor-1/notes") { return Response.json({ data: [{ id: "n1", title: "Note A", },], },); }
      return Response.json({ data: [], },);
    };
    const state = actorEntitiesFactory("actor-1", "notes",);
    await flush();
    expect(state._entKind,).toBe("notes",);
    expect(state._entActorId,).toBe("actor-1",);
    expect(state.rows.length,).toBe(1,);
  });

  test("config returns the per-kind schema", () => {
    const notes = baseState("notes",);
    expect(notes.config().titleField,).toBe("title",);
    expect(notes.config().fields.map((f,) => f.key),).toEqual(["title", "content",],);

    const items = baseState("items",);
    expect(items.config().titleField,).toBe("name",);
    expect(items.config().fields.map((f,) => f.key),).toEqual(["name", "description", "quantity",],);

    const lore = baseState("lore-entries",);
    expect(lore.config().titleField,).toBe("title",);
    expect(lore.config().fields.length,).toBe(2,);
  });
});

describe("actorEntitiesState.filteredRows", () => {
  test("returns all rows when search is empty", () => {
    const state = baseState();
    state.rows = [{ id: "1", title: "A", }, { id: "2", title: "B", },];
    expect(state.filteredRows().length,).toBe(2,);
  });

  test("filters by case-insensitive title substring", () => {
    const state = baseState();
    state.rows = [{ id: "1", title: "Hello", }, { id: "2", title: "World", },];
    state.search = "hello";
    expect(state.filteredRows().map((r,) => r.id),).toEqual(["1",],);
  });

  test("uses the per-kind titleField", () => {
    const state = baseState("items",);
    state.rows = [{ id: "1", name: "Sword", }, { id: "2", name: "Shield", },];
    state.search = "shield";
    expect(state.filteredRows().map((r,) => r.id),).toEqual(["2",],);
  });
});

describe("actorEntitiesState.load", () => {
  test("no-op without actor id", async () => {
    await flush();
    calls.length = 0;
    const state = stateFromKind("notes",);
    state._entActorId = null;
    await state.load();
    expect(calls.length,).toBe(0,);
  });

  test("populates rows on 200", async () => {
    handler = async () => Response.json({ data: [{ id: "n1", title: "X", },], },);
    const state = baseState();
    state._entActorId = null; // suppress constructor load
    await state.load();
    state._entActorId = "actor-1";
    await state.load();
    expect(state.rows.length,).toBe(1,);
  });

  test("captures error on non-OK", async () => {
    handler = async () => Response.json({}, { status: 500, },);
    const state = baseState();
    state._entActorId = null;
    state._entActorId = "actor-1";
    await state.load();
    expect(state.rowsError,).toBeTruthy();
  });

  test("tolerates missing data array", async () => {
    handler = async () => Response.json({},);
    const state = baseState();
    state._entActorId = null;
    state._entActorId = "actor-1";
    await state.load();
    expect(state.rows,).toEqual([],);
  });
});

describe("actorEntitiesState.create / save / remove", () => {
  test("create POSTs payload and reloads", async () => {
    handler = async (_url: string, opts?: RequestInit,) => {
      if (opts?.method === "POST") { return Response.json({ id: "new", }, { status: 201, },); }
      return Response.json({ data: [{ id: "new", title: "X", },], },);
    };
    const state = baseState();
    state._entActorId = null;
    state.form.title = "Hello";
    state.form.content = "World";
    state._entActorId = "actor-1";
    await state.create();
    expect(calls.some((c,) => c.opts.method === "POST" && c.url === "/api/v1/actors/actor-1/notes"),).toBe(true,);
    expect(state.form.title,).toBe("",);
    expect(state.editingId,).toBeNull();
  });

  test("create skips when actor id is missing", async () => {
    await flush();
    const callsBefore = calls.length;
    const state = baseState();
    state._entActorId = null;
    await state.create();
    expect(calls.length,).toBe(callsBefore,);
  });

  test("create captures server message on non-201", async () => {
    handler = async () => Response.json({ message: "bad", }, { status: 400, },);
    const state = baseState();
    state._entActorId = null;
    state.form.title = "x";
    state._entActorId = "actor-1";
    await state.create();
    expect(state.rowsError,).toBe("bad",);
  });

  test("save PUTs the form when editingId is set", async () => {
    handler = async () => Response.json({ ok: true, },);
    const state = baseState();
    state._entActorId = null;
    state._entActorId = "actor-1";
    state.editingId = "row-1";
    state.form.title = "edited";
    state.form.content = "body";
    await state.save();
    expect(calls.some((c,) => c.opts.method === "PUT" && c.url === "/api/v1/actors/actor-1/notes/row-1"),).toBe(true,);
  });

  test("save no-ops without editingId", async () => {
    await flush();
    const callsBefore = calls.length;
    const state = baseState();
    state._entActorId = "actor-1";
    await state.save();
    expect(calls.length,).toBe(callsBefore,);
  });

  test("remove DELETEs the row by id", async () => {
    handler = async () => Response.json({ ok: true, },);
    const state = baseState();
    state._entActorId = "actor-1";
    await state.remove("row-1",);
    expect(calls.some((c,) => c.opts.method === "DELETE" && c.url === "/api/v1/actors/actor-1/notes/row-1"),).toBe(true,);
  });

  test("remove no-ops without actor id", async () => {
    // Drain any in-flight work from prior tests so `calls` reflects only this
    // test's interactions.
    await flush();
    const callsBefore = calls.length;
    const state = baseState();
    state._entActorId = null;
    await state.remove("row-1",);
    expect(calls.length,).toBe(callsBefore,);
  });

  test("busy flag prevents concurrent operations", async () => {
    let resolveHandler: ((r: Response,) => void) | null = null;
    handler = async () =>
      new Promise<Response>((r,) => {
        resolveHandler = r;
        queueMicrotask(() => r(Response.json({ id: "x", }, { status: 201, },),));
      },);
    const state = baseState();
    state._entActorId = null;
    state.form.title = "x";
    state._entActorId = "actor-1";
    const p1 = state.create();
    const callsBefore = calls.length;
    await state.create();
    expect(calls.length,).toBe(callsBefore,);
    await p1;
    void resolveHandler;
  });

  test("create handles numeric fields", async () => {
    await flush();
    calls.length = 0;
    handler = async () => Response.json({ id: "x", }, { status: 201, },);
    const state = baseState("items",);
    state._entActorId = "actor-1";
    state.form.name = "Sword";
    state.form.quantity = "3";
    await state.create();
    const postCall = calls.find((c,) => c.opts.method === "POST");
    expect(postCall?.opts.body,).toContain('"quantity":3',);
  });
});

describe("actorEntitiesState form helpers", () => {
  test("resetForm clears fields and editingId", () => {
    const state = baseState();
    state.form.title = "X";
    state.editingId = "x";
    state.resetForm();
    expect(state.form.title,).toBe("",);
    expect(state.editingId,).toBeNull();
  });

  test("loadIntoForm seeds fields from a row", () => {
    const state = baseState();
    state.loadIntoForm({ id: "n1", title: "Hello", content: "World", },);
    expect(state.form.title,).toBe("Hello",);
    expect(state.form.content,).toBe("World",);
    expect(state.editingId,).toBe("n1",);
  });

  test("loadIntoForm coerces null/undefined to empty string", () => {
    const state = baseState();
    state.loadIntoForm({ id: "n1", title: null as unknown as string, content: undefined, },);
    expect(state.form.title,).toBe("",);
    expect(state.form.content,).toBe("",);
  });

  test("cancelEdit delegates to resetForm", () => {
    const state = baseState();
    state.form.title = "x";
    state.editingId = "x";
    state.cancelEdit();
    expect(state.form.title,).toBe("",);
  });
});
