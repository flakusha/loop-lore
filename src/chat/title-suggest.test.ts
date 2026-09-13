import { beforeAll, describe, expect, it, mock, } from "bun:test";
import type { AuxCallResult, } from "../aux-pipeline/types";
import { createLogger, } from "../logger";
import {
  deriveChatTitleFallback,
  isUntitledChatName,
  suggestChatTitle,
  titleUntitledChatFromFirstMessage,
} from "./title-suggest";

const callAuxMock = mock<() => Promise<AuxCallResult | null>>(() => Promise.resolve(null,));
// Hoisted above imports: title-suggest binds the stubbed callAux.
mock.module("../aux-pipeline", () => ({ callAux: callAuxMock, }),);

beforeAll(() => {
  createLogger({ level: "error", },);
},);

const noAuxConfig = {
  generation: {
    defaultProvider: "mock-provider",
    defaultModels: { "mock-provider": "mock-model", },
    modelRoles: {},
  },
} as any;

const mockDb = {} as any;

describe("deriveChatTitleFallback", () => {
  it("trims and collapses whitespace", () => {
    expect(deriveChatTitleFallback("  hello   world\n\tfoo ",),).toBe("hello world foo",);
  });

  it("returns 'New chat' on empty input", () => {
    expect(deriveChatTitleFallback("",),).toBe("New chat",);
    expect(deriveChatTitleFallback("   \n\t  ",),).toBe("New chat",);
  });

  it("slices long text to 40 chars with ellipsis", () => {
    const long = "a".repeat(100,);
    const result = deriveChatTitleFallback(long,);
    expect(result,).toBe(`${"a".repeat(40,)}…`,);
  });

  it("leaves 40-char text untouched", () => {
    const exact = "a".repeat(40,);
    expect(deriveChatTitleFallback(exact,),).toBe(exact,);
  });
});

describe("suggestChatTitle (fallback)", () => {
  it("falls back when AUX returns null", async () => {
    const result = await suggestChatTitle({
      config: noAuxConfig,
      db: mockDb,
      firstMessage: "Tell me about the haunted castle",
    },);
    expect(result,).toBe("Tell me about the haunted castle",);
  });

  it("falls back to 'New chat' on empty first message", async () => {
    const result = await suggestChatTitle({
      config: noAuxConfig,
      db: mockDb,
      firstMessage: "   ",
    },);
    expect(result,).toBe("New chat",);
  });
});

describe("suggestChatTitle (mocked AUX)", () => {
  function auxResult(content: string,) {
    return {
      content,
      model: "m",
      provider: "p",
      latencyMs: 1,
      promptTokens: 1,
      completionTokens: 1,
    };
  }

  it("returns AUX content trimmed", async () => {
    callAuxMock.mockResolvedValue(auxResult("  The Haunted Castle  ",),);
    const result = await suggestChatTitle({
      config: noAuxConfig,
      db: mockDb,
      firstMessage: "Tell me about the haunted castle",
    },);
    expect(result,).toBe("The Haunted Castle",);
  });

  it("caps long AUX content at 60 chars", async () => {
    callAuxMock.mockResolvedValue(auxResult("b".repeat(100,),),);
    const result = await suggestChatTitle({
      config: noAuxConfig,
      db: mockDb,
      firstMessage: "hello",
    },);
    expect(result,).toBe(`${"b".repeat(60,)}…`,);
  });

  it("falls back when AUX returns null", async () => {
    callAuxMock.mockResolvedValue(null,);
    const result = await suggestChatTitle({
      config: noAuxConfig,
      db: mockDb,
      firstMessage: "Explore the dark forest",
    },);
    expect(result,).toBe("Explore the dark forest",);
  });

  it("never rejects when AUX throws", async () => {
    callAuxMock.mockRejectedValue(new Error("aux down",),);
    const result = await suggestChatTitle({
      config: noAuxConfig,
      db: mockDb,
      firstMessage: "Explore the dark forest",
    },);
    expect(result,).toBe("Explore the dark forest",);
  });
});

describe("isUntitledChatName", () => {
  it("treats null, empty, and the placeholder as untitled", () => {
    expect(isUntitledChatName(null,),).toBe(true,);
    expect(isUntitledChatName("",),).toBe(true,);
    expect(isUntitledChatName("New Chat",),).toBe(true,);
    expect(isUntitledChatName("My Campaign",),).toBe(false,);
  });
});

describe("titleUntitledChatFromFirstMessage", () => {
  function mockChatDb(captured: { name?: string }, fail = false,) {
    return {
      updateTable: () => ({
        set: (values: { name: string },) => {
          captured.name = values.name;
          return {
            where: () => ({
              execute: async () => {
                if (fail) { throw new Error("db down",); }
              },
            }),
          };
        },
      }),
    } as any;
  }

  it("titles an untitled group chat from the first message", async () => {
    callAuxMock.mockResolvedValue(null,);
    const captured: { name?: string } = {};
    await titleUntitledChatFromFirstMessage({
      config: noAuxConfig,
      db: mockChatDb(captured,),
      chatId: "chat-1",
      chatRecord: { name: "New Chat", mode: "group", },
      firstMessage: "Explore the dark forest",
    },);
    expect(captured.name,).toBe("Explore the dark forest",);
  });

  it("skips already-titled chats", async () => {
    const captured: { name?: string } = {};
    await titleUntitledChatFromFirstMessage({
      config: noAuxConfig,
      db: mockChatDb(captured,),
      chatId: "chat-1",
      chatRecord: { name: "My Campaign", mode: "group", },
      firstMessage: "hello",
    },);
    expect(captured.name,).toBeUndefined();
  });

  it("skips direct chats (rule-based rename owns them)", async () => {
    const captured: { name?: string } = {};
    await titleUntitledChatFromFirstMessage({
      config: noAuxConfig,
      db: mockChatDb(captured,),
      chatId: "chat-1",
      chatRecord: { name: "New Chat", mode: "direct", },
      firstMessage: "hello",
    },);
    expect(captured.name,).toBeUndefined();
  });

  it("never rejects when the update fails", async () => {
    callAuxMock.mockResolvedValue(null,);
    await titleUntitledChatFromFirstMessage({
      config: noAuxConfig,
      db: mockChatDb({}, true,),
      chatId: "chat-1",
      chatRecord: { name: null, mode: "group", },
      firstMessage: "hello",
    },);
  });
});
