import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { memoryPanel, } from "./memory-panel";
import type { ChatState, } from "./types";

// apiFetch is a browser global wired at runtime via globalThis.apiFetch — stub it.
const fetchCalls: { url: string; opts?: RequestInit }[] = [];
let fetchHandler: ((url: string, opts?: RequestInit,) => Response) | null = null;
const originalApiFetch = (globalThis as Record<string, unknown>).apiFetch;

/**
 * @param overrides
 */
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

/**
 * @param status
 * @param body
 */
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

describe("memoryPanel.saveEditMemory", () => {
  test("PUTs the trimmed content and updates the entry in place", async () => {
    mockFetch(200, {},);
    const c = ctx({
      memoryPanel: {
        ...(memoryPanel.memoryPanel as object),
        activeTab: "character",
        characterMemories: [
          {
            id: "m1",
            content: "old",
            type: "episodic",
            confidence: 1,
            importance: 1,
            keywords: [],
            createdAt: "t",
            tokenCount: 1,
          },
        ],
        editingMemoryId: "m1",
        editMemoryContent: "  updated content  ",
      },
    },);
    await c.saveEditMemory!();
    expect(fetchCalls[0]!.url,).toBe("/api/actors/char-1/memories/m1",);
    expect(fetchCalls[0]!.opts?.method,).toBe("PUT",);
    expect(JSON.parse(fetchCalls[0]!.opts?.body as string,),).toEqual({ content: "updated content", },);
    expect(c.memoryPanel!.characterMemories[0]!.content,).toBe("updated content",);
    expect(c.memoryPanel!.editingMemoryId,).toBeNull();
  });

  test("does nothing when no memory is being edited", async () => {
    const c = ctx();
    await c.saveEditMemory!();
    expect(fetchCalls,).toEqual([],);
  });
});

describe("memoryPanel world-tab write guard", () => {
  test("non-admin cannot start editing on the world tab", () => {
    const c = ctx({
      userRole: "user",
      memoryPanel: {
        ...(memoryPanel.memoryPanel as object),
        activeTab: "world",
        worldMemories: [
          { id: "w1", content: "lore", type: "fact", confidence: 1, importance: 1, keywords: [], createdAt: "t", },
        ],
      },
    },);
    c.startEditMemory!(c.memoryPanel!.worldMemories[0]!,);
    expect(c.memoryPanel!.editingMemoryId,).toBeNull();
    expect(c._canWriteActiveTab!(),).toBe(false,);
  });

  test("admin can write on the world tab", () => {
    const c = ctx({
      userRole: "admin",
      memoryPanel: {
        ...(memoryPanel.memoryPanel as object),
        activeTab: "world",
      },
    },);
    expect(c._canWriteActiveTab!(),).toBe(true,);
  });
});

describe("memoryPanel.rememberMessage", () => {
  test("POSTs the message content as a character memory with source link", async () => {
    mockFetch(201, { id: "m9", },);
    const c = ctx();
    await c.rememberMessage!("msg-1", "  the wizard is afraid of fire  ",);
    expect(fetchCalls[0]!.opts?.method,).toBe("POST",);
    expect(JSON.parse(fetchCalls[0]!.opts?.body as string,),).toMatchObject({
      content: "the wizard is afraid of fire",
      scope: "character",
      sourceMessageIds: ["msg-1",],
    },);
  });

  test("skips empty content without a request", async () => {
    const c = ctx();
    await c.rememberMessage!("msg-1", "   ",);
    expect(fetchCalls,).toEqual([],);
  });
});

describe("memoryPanel.toggleMemoryInChat", () => {
  test("re-including an excluded memory POSTs carry with the chat id", async () => {
    mockFetch(200, { items: [], },);
    const c = ctx({
      activeChat: "chat-1",
      memoryPanel: {
        ...(memoryPanel.memoryPanel as object),
        activeTab: "character",
        characterMemories: [
          // A carried copy makes the chat selective; m2 (original, other chat) is out.
          {
            id: "copy-1",
            content: "in",
            type: "episodic",
            confidence: 1,
            importance: 1,
            keywords: [],
            createdAt: "t",
            sourceChatId: "chat-1",
          },
          { id: "m2", content: "out", type: "episodic", confidence: 1, importance: 1, keywords: [], createdAt: "t", },
        ],
      },
    },);
    await c.toggleMemoryInChat!(c.memoryPanel!.characterMemories[1]!,);
    const carry = fetchCalls.find((f,) => f.url.endsWith("/carry",));
    expect(carry,).toBeDefined();
    expect(JSON.parse(carry!.opts?.body as string,),).toEqual({ chatId: "chat-1", },);
  });

  test("excluding a legacy full-carry chat calls carry-except", async () => {
    mockFetch(200, { items: [], },);
    const c = ctx({
      activeChat: "chat-1",
      memoryPanel: {
        ...(memoryPanel.memoryPanel as object),
        activeTab: "character",
        characterMemories: [
          { id: "m1", content: "c", type: "episodic", confidence: 1, importance: 1, keywords: [], createdAt: "t", },
        ],
      },
    },);
    await c.toggleMemoryInChat!(c.memoryPanel!.characterMemories[0]!,);
    const except = fetchCalls.find((f,) => f.url.endsWith("/carry-except",));
    expect(except,).toBeDefined();
    expect(JSON.parse(except!.opts?.body as string,),).toEqual({ chatId: "chat-1", excludeId: "m1", },);
  });

  test("removing a chat copy DELETEs the copy row", async () => {
    mockFetch(200, { items: [], },);
    const c = ctx({
      activeChat: "chat-1",
      memoryPanel: {
        ...(memoryPanel.memoryPanel as object),
        activeTab: "character",
        characterMemories: [
          {
            id: "copy-1",
            content: "c",
            type: "episodic",
            confidence: 1,
            importance: 1,
            keywords: [],
            createdAt: "t",
            sourceChatId: "chat-1",
          },
        ],
      },
    },);
    await c.toggleMemoryInChat!(c.memoryPanel!.characterMemories[0]!,);
    const del = fetchCalls.find((f,) => f.opts?.method === "DELETE");
    expect(del?.url,).toBe("/api/actors/char-1/memories/copy-1",);
  });
});

describe("memoryPanel review actions", () => {
  test("approveMemory PUTs reviewStatus committed and reloads", async () => {
    mockFetch(200, { items: [], },);
    const c = ctx({
      memoryPanel: {
        ...(memoryPanel.memoryPanel as object),
        activeTab: "character",
      },
    },);
    await c.approveMemory!("m1",);
    expect(fetchCalls[0]!.url,).toBe("/api/actors/char-1/memories/m1",);
    expect(fetchCalls[0]!.opts?.method,).toBe("PUT",);
    expect(JSON.parse(fetchCalls[0]!.opts?.body as string,),).toEqual({ reviewStatus: "committed", },);
    expect(fetchCalls.some((f,) => f.url.endsWith("/memories",)),).toBe(true,);
  });

  test("rejectMemory PUTs reviewStatus rejected", async () => {
    mockFetch(200, { items: [], },);
    const c = ctx();
    await c.rejectMemory!("m1",);
    expect(JSON.parse(fetchCalls[0]!.opts?.body as string,),).toEqual({ reviewStatus: "rejected", },);
  });

  test("skips when a request is already in flight", async () => {
    const c = ctx({
      memoryPanel: {
        ...(memoryPanel.memoryPanel as object),
        busy: true,
      },
    },);
    await c.rejectMemory!("m1",);
    expect(fetchCalls,).toEqual([],);
  });
});
