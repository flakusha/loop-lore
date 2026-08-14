import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { memoryPanel, } from "./memory-panel";
import type { ChatState, } from "./types";

// apiFetch is a browser global wired at runtime via globalThis.apiFetch — stub it.
const fetchCalls: { url: string; opts?: RequestInit }[] = [];
let fetchHandler: ((url: string, opts?: RequestInit,) => Response) | null = null;
const originalApiFetch = (globalThis as Record<string, unknown>).apiFetch;

function ctx(overrides: Record<string, unknown> = {},): ChatState {
  return {
    ...(memoryPanel as unknown as ChatState),
    _chatParticipants: [
      { actor_id: "char-1", name: "Char", display_name: "Char", actor_type: "character", },
    ],
    userRole: "user",
    userDisplayName: "Me",
    ...overrides,
  } as unknown as ChatState;
}

function mockFetch(status: number, body: unknown = {},) {
  fetchHandler = (_url: string, _opts?: RequestInit,) => Response.json(body, { status, },);
}

beforeEach(() => {
  fetchCalls.length = 0;
  fetchHandler = null;
  (globalThis as Record<string, unknown>).apiFetch = async (url: string | URL, opts?: RequestInit,) => {
    fetchCalls.push({ url: String(url,), opts, },);
    if (!fetchHandler) { return new Response("{}", { status: 500, },); }
    return fetchHandler(String(url,), opts ?? {},);
  };
},);

afterEach(() => {
  fetchHandler = null;
  (globalThis as Record<string, unknown>).apiFetch = originalApiFetch;
},);

const sampleMemories = {
  items: [
    {
      id: "m1",
      content: "char memory",
      memory_type: "episodic",
      confidence: 1,
      importance: 5,
      keywords: "[]",
      pinned: false,
      scope: "character",
      created_at: "t",
    },
    {
      id: "m2",
      content: "assistant memory",
      memory_type: "semantic",
      confidence: 1,
      importance: 5,
      keywords: "[]",
      pinned: false,
      scope: "assistant",
      created_at: "t",
    },
    {
      id: "m3",
      content: "world memory",
      memory_type: "procedural",
      confidence: 1,
      importance: 5,
      keywords: "[]",
      pinned: false,
      scope: "world",
      created_at: "t",
    },
    {
      id: "m4",
      content: "legacy no-scope",
      memory_type: "episodic",
      confidence: 1,
      importance: 5,
      keywords: "[]",
      pinned: false,
      created_at: "t",
    },
  ],
};

describe("memoryPanel.loadMemories", () => {
  test("splits items into character/assistant/world by scope", async () => {
    mockFetch(200, sampleMemories,);
    const c = ctx();
    await c.loadMemories!();
    // m1 (character) + m4 (no scope → defaults to character)
    expect(c.memoryPanel!.characterMemories,).toHaveLength(2,);
    expect(c.memoryPanel!.characterMemories[0]!.id,).toBe("m1",);
    expect(c.memoryPanel!.assistantMemories,).toHaveLength(1,);
    expect(c.memoryPanel!.assistantMemories[0]!.id,).toBe("m2",);
    expect(c.memoryPanel!.worldMemories,).toHaveLength(1,);
    expect(c.memoryPanel!.worldMemories[0]!.id,).toBe("m3",);
    expect(fetchCalls[0]!.url,).toBe("/api/actors/char-1/memories",);
  });

  test("resets all three tabs when no character actor resolves", async () => {
    const c = ctx({ _chatParticipants: [], },);
    await c.loadMemories!();
    expect(c.memoryPanel!.characterMemories,).toEqual([],);
    expect(c.memoryPanel!.assistantMemories,).toEqual([],);
    expect(c.memoryPanel!.worldMemories,).toEqual([],);
    expect(fetchCalls,).toEqual([],);
  });
});

describe("memoryPanel.createMemory", () => {
  test("POSTs scope matching the active tab and prepends to that tab", async () => {
    mockFetch(201, {
      id: "m5",
      content: "new",
      memory_type: "episodic",
      confidence: 1,
      importance: 5,
      keywords: "[]",
      scope: "assistant",
      created_at: "t",
    },);
    const c = ctx({
      memoryPanel: {
        ...(memoryPanel.memoryPanel as object),
        activeTab: "assistant",
        newMemoryContent: "  new memory  ",
        showCreateForm: true,
      },
    },);
    await c.createMemory!();
    expect(fetchCalls[0]!.opts?.method,).toBe("POST",);
    expect(JSON.parse(fetchCalls[0]!.opts?.body as string,),).toMatchObject({
      content: "new memory",
      scope: "assistant",
    },);
    expect(c.memoryPanel!.assistantMemories[0]!.id,).toBe("m5",);
    expect(c.memoryPanel!.newMemoryContent,).toBe("",);
  });
});
