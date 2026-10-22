// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Quests page tests — pagination math, progress clamping, expand/edit
 * behavior, and the fetch-backed load/init flows.
 *
 * Resource contract: each test gets a fresh page state object; fetch and
 * location are stubbed per-test in beforeEach and restored in afterEach.
 * No shared DOM, timers, or network. Order-independent.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { QuestRow, } from "./quests-parts";

// ── minimal fake DOM (querySelector registry + createElement) ──

type FakeEl = {
  tagName: string;
  className: string;
  textContent: string;
  children: FakeEl[];
  removedClasses: string[];
  classList: { add: (c: string,) => void; remove: (c: string,) => void; contains: (c: string,) => boolean };
  append: (...kids: FakeEl[]) => void;
  setAttribute: (name: string, value: string,) => void;
  addEventListener: (type: string, fn: () => void,) => void;
  remove: () => void;
};

function makeEl(tag: string,): FakeEl {
  const el: FakeEl = {
    tagName: tag,
    className: "",
    textContent: "",
    children: [],
    removedClasses: [],
    classList: {
      add: (c,) => {
        el.className += ` ${c}`;
      },
      remove: (c,) => {
        el.removedClasses.push(c,);
      },
      contains: () => false,
    },
    append: (...kids) => {
      el.children.push(...kids,);
    },
    setAttribute: () => {},
    addEventListener: () => {},
    remove: () => {},
  };

  return el;
}

function installFakeDocument(): { selectors: Map<string, FakeEl>; toasts: () => { type: string; message: string }[] } {
  const selectors = new Map<string, FakeEl>();
  const container = makeEl("div",);
  selectors.set("#toast-container", container,);
  (globalThis as { document: unknown }).document = {
    cookie: "",
    querySelector: (sel: string,) => selectors.get(sel,) ?? null,
    createElement: (tag: string,) => makeEl(tag,),
  };

  return {
    selectors,
    toasts: () =>
      container.children.map((t,) => ({
        type: (t.className.match(/toast\s+(\S+)/,) ?? [])[1] ?? "",
        message: t.children[1]?.textContent ?? "",
      })),
  };
}

// ── fetch / location stubs ───────────────────────────────────

type FetchOpts = Record<string, unknown>;
let fetchCalls: { url: string; opts?: FetchOpts }[] = [];
let fetchImpl: (url: string, opts?: FetchOpts,) => Promise<Response> = async () =>
  new Response(JSON.stringify({ data: [], total: 0, },), {
    status: 200,
    headers: { "Content-Type": "application/json", },
  },);

const realFetch = globalThis.fetch;
const realLocation = (globalThis as { location?: unknown }).location;
let assignedUrls: string[] = [];

function jsonResponse(body: unknown, status = 200,): Response {
  return new Response(JSON.stringify(body,), {
    status,
    headers: { "Content-Type": "application/json", },
  },);
}

function questRow(overrides: Partial<QuestRow> = {},): QuestRow {
  return {
    id: "q1",
    name: "Find the Relic",
    description: "old text",
    type: "collection",
    category: "side",
    status: "active",
    priority: 5,
    progress: 2,
    target: 5,
    world_id: "w1",
    created_at: "2026-01-02T03:04:05.000Z",
    ...overrides,
  };
}

function page() {
  const fn = (globalThis as unknown as Record<string, () => Record<string, unknown>>).questsPage;
  if (typeof fn !== "function") { throw new Error("questsPage not registered",); }
  return fn() as {
    worldId: string;
    worldName: string;
    quests: QuestRow[];
    total: number;
    page: number;
    pageSize: number;
    loading: boolean;
    expandedQuest: string;
    editName: string;
    editDescription: string;
    editPriority: number;
    worldOptions: { id: string; name: string }[];
    readonly totalPages: number;
    init(): Promise<void>;
    loadWorlds(): Promise<void>;
    loadQuests(): Promise<void>;
    goToWorld(id: string,): void;
    goPage(p: number,): Promise<void>;
    formatDate(iso: string | null,): string;
    progressPct(q: QuestRow,): number;
    expandQuest(questId: string,): void;
  };
}

beforeEach(() => {
  const fake = installFakeDocument();
  fakeDoc = fake;
  fetchCalls = [];
  assignedUrls = [];
  fetchImpl = async () => jsonResponse({ data: [], total: 0, },);
  (globalThis as { fetch: unknown }).fetch = (url: string, opts?: FetchOpts,) => {
    fetchCalls.push({ url, opts, },);
    return fetchImpl(url, opts,);
  };

  (globalThis as { location: unknown }).location = {
    search: "",
    assign: (url: string,) => {
      assignedUrls.push(url,);
    },
  };
},);

let fakeDoc: ReturnType<typeof installFakeDocument>;

afterEach(() => {
  (globalThis as { fetch: unknown }).fetch = realFetch;
  (globalThis as { location?: unknown }).location = realLocation;
},);

// Register the page component (idempotent module-level globalThis write).
let modPromise: Promise<unknown> | null = null;
function loadModule(): Promise<unknown> {
  modPromise ??= import("./quests");
  return modPromise;
}

// ── pure derived state ───────────────────────────────────────

describe("questsPage — derived state", () => {
  test("totalPages is at least 1 and ceil(total/pageSize)", async () => {
    await loadModule();
    const p = page();
    expect(p.totalPages,).toBe(1,); // 0 total → 1

    p.total = 45;
    p.pageSize = 20;
    expect(p.totalPages,).toBe(3,);

    p.total = 40;
    expect(p.totalPages,).toBe(2,); // exact multiple, no extra page
  });

  test("progressPct clamps to [0, 100] and treats a non-positive target as 0", async () => {
    await loadModule();
    const p = page();
    expect(p.progressPct(questRow({ progress: 0, target: 0, },),),).toBe(0,);
    expect(p.progressPct(questRow({ progress: 0, target: -3, },),),).toBe(0,);
    expect(p.progressPct(questRow({ progress: 50, target: 200, },),),).toBe(25,);
    expect(p.progressPct(questRow({ progress: 300, target: 200, },),),).toBe(100,);
  });

  test("formatDate renders '-' for null timestamps", async () => {
    await loadModule();
    const p = page();
    expect(p.formatDate(null,),).toBe("-",);
    expect(p.formatDate("2026-01-02T03:04:05.000Z",),).not.toBe("-",);
  });
});

// ── expand/edit selection state ──────────────────────────────

describe("questsPage — expandQuest", () => {
  test("selecting a quest populates edit fields; selecting it again collapses", async () => {
    await loadModule();
    const p = page();
    p.quests = [
      questRow({ id: "q1", name: "Relic", description: "old", priority: 7, },),
      questRow({ id: "q2", name: "Other", description: null, priority: 1, },),
    ];

    p.expandQuest("q1",);
    expect(p.expandedQuest,).toBe("q1",);
    expect(p.editName,).toBe("Relic",);
    expect(p.editDescription,).toBe("old",);
    expect(p.editPriority,).toBe(7,);

    p.expandQuest("q2",);
    expect(p.expandedQuest,).toBe("q2",);
    expect(p.editName,).toBe("Other",);
    expect(p.editDescription,).toBe("",); // null description becomes empty string

    p.expandQuest("q2",);
    expect(p.expandedQuest,).toBe("",); // toggle collapse
  });
});

// ── fetch-backed flows ───────────────────────────────────────

describe("questsPage — loading", () => {
  test("loadQuests populates quests, total, and world name, then clears loading", async () => {
    await loadModule();
    const p = page();
    p.worldId = "w1";
    fetchImpl = async (url,) => {
      if (url.includes("/quests",)) { return jsonResponse({ data: [questRow(),], total: 41, },); }
      return jsonResponse({ name: "Castle World", },);
    };

    await p.loadQuests();

    expect(p.quests,).toHaveLength(1,);
    expect(p.total,).toBe(41,);
    expect(p.worldName,).toBe("Castle World",);
    expect(p.loading,).toBe(false,);
    expect(fetchCalls[0]!.url,).toBe("/api/v1/worlds/w1/quests?page=1&pageSize=20",);
  });

  test("loadQuests swallows network errors and resets loading", async () => {
    await loadModule();
    const p = page();
    p.worldId = "w1";
    fetchImpl = async () => {
      throw new Error("down",);
    };

    await expect(p.loadQuests(),).resolves.toBeUndefined();
    expect(p.loading,).toBe(false,);
    expect(fakeDoc.toasts().some((t,) => t.type === "error" && t.message === "Failed to load quests"),).toBe(true,);
  });

  test("init with a valid worldId loads quests; with an unknown worldId redirects", async () => {
    await loadModule();
    const p = page();
    (globalThis as { location: { search: string } }).location.search = "?worldId=w1";
    fetchImpl = async (url,) =>
      url.includes("/quests",)
        ? jsonResponse({ data: [questRow(),], total: 1, },)
        : jsonResponse({ name: "Castle World", },);

    await p.init();
    expect(p.quests,).toHaveLength(1,);
    expect(assignedUrls,).toEqual([],);

    fetchImpl = async () => jsonResponse({ message: "nope", }, 404,);
    await p.init();
    expect(assignedUrls,).toEqual(["/views/quests",],);
  });

  test("init without worldId loads the world picker instead", async () => {
    await loadModule();
    const p = page();
    fetchImpl = async () => jsonResponse({ data: [{ id: "w1", name: "Castle World", },], },);

    await p.init();
    expect(p.worldOptions,).toEqual([{ id: "w1", name: "Castle World", },],);
    expect(fetchCalls[0]!.url,).toBe("/api/v1/worlds?pageSize=100",);
  });

  test("goPage updates the page and refetches with the new page number", async () => {
    await loadModule();
    const p = page();
    p.worldId = "w1";
    fetchImpl = async () => jsonResponse({ data: [], total: 0, },);

    await p.goPage(3,);
    expect(p.page,).toBe(3,);
    const questFetches = fetchCalls.filter((c,) => c.url.includes("/quests",));
    expect(questFetches.at(-1,)?.url,).toBe("/api/v1/worlds/w1/quests?page=3&pageSize=20",);
  });
});
