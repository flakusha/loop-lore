import { afterAll, beforeAll, describe, expect, mock, test, } from "bun:test";
import { chatActions, } from "./chat-actions";
import { chatGenerations, } from "./chat-generations";
import { createLogger, } from "./logger";
import type { ChatState, } from "./types";

describe("chatActions utility functions", () => {
  describe("formattedGenerationTime", () => {
    test("returns empty string for undefined", () => {
      expect(chatActions.formattedGenerationTime!(undefined,),).toBe("",);
    });

    test("returns empty string for null", () => {
      expect(chatActions.formattedGenerationTime!(null as any,),).toBe("",);
    });

    test("returns ms for values under 1000", () => {
      expect(chatActions.formattedGenerationTime!(0,),).toBe("",);
      expect(chatActions.formattedGenerationTime!(500,),).toBe("500ms",);
      expect(chatActions.formattedGenerationTime!(999,),).toBe("999ms",);
    });

    test("returns seconds for values under 60000", () => {
      expect(chatActions.formattedGenerationTime!(1000,),).toBe("1.0s",);
      expect(chatActions.formattedGenerationTime!(5000,),).toBe("5.0s",);
      expect(chatActions.formattedGenerationTime!(30_000,),).toBe("30.0s",);
      expect(chatActions.formattedGenerationTime!(59_999,),).toBe("60.0s",);
    });

    test("returns minutes for values 60000 and above", () => {
      expect(chatActions.formattedGenerationTime!(60_000,),).toBe("1.0m",);
      expect(chatActions.formattedGenerationTime!(120_000,),).toBe("2.0m",);
      expect(chatActions.formattedGenerationTime!(3_600_000,),).toBe("60.0m",);
    });
  });

  describe("formattedTokensPerSecond", () => {
    test("returns empty string for undefined message", () => {
      expect(chatActions.formattedTokensPerSecond!({},),).toBe("",);
    });

    test("returns empty string for message without metrics", () => {
      expect(chatActions.formattedTokensPerSecond!({},),).toBe("",);
    });

    test("uses tokens_per_second when available", () => {
      const result = chatActions.formattedTokensPerSecond!({ tokens_per_second: 42.5, },);
      expect(result,).toBe("42.5 t/s",);
    });

    test("calculates t/s from generation_time_ms and token_count_total", () => {
      const result = chatActions.formattedTokensPerSecond!({
        generation_time_ms: 1000,
        token_count_total: 100,
      },);
      expect(result,).toBe("100.0 t/s",);
    });

    test("returns empty string when calculation values missing", () => {
      const result = chatActions.formattedTokensPerSecond!({ generation_time_ms: 1000, },);
      expect(result,).toBe("",);
    });
  });

  describe("statsLine", () => {
    test("returns empty string for empty message", () => {
      expect(chatActions.statsLine!({},),).toBe("",);
    });

    test("includes model_id", () => {
      const result = chatActions.statsLine!({ model_id: "gpt-4", },);
      expect(result,).toBe("gpt-4",);
    });

    test("includes provider", () => {
      const result = chatActions.statsLine!({ model_id: "gpt-4", provider: "openai", },);
      expect(result,).toBe("gpt-4 · openai",);
    });

    test("includes formatted generation time", () => {
      const result = chatActions.statsLine!({ model_id: "gpt-4", generation_time_ms: 5000, },);
      expect(result,).toContain("gpt-4",);
      expect(result,).toContain("5.0s",);
    });

    test("includes token count", () => {
      const result = chatActions.statsLine!({ model_id: "gpt-4", token_count_total: 150, },);
      expect(result,).toContain("gpt-4",);
      expect(result,).toContain("150t",);
    });

    test("includes tokens per second", () => {
      const result = chatActions.statsLine!({ model_id: "gpt-4", tokens_per_second: 30, },);
      expect(result,).toContain("gpt-4",);
      expect(result,).toContain("30.0 t/s",);
    });

    test("includes all fields when present", () => {
      const result = chatActions.statsLine!({
        model_id: "gpt-4",
        provider: "openai",
        generation_time_ms: 5000,
        token_count_total: 150,
        tokens_per_second: 30,
      },);
      expect(result,).toBe("gpt-4 · openai · 5.0s · 150t · 30.0 t/s",);
    });

    test("handles missing optional fields", () => {
      const result = chatActions.statsLine!({
        model_id: "gpt-4",
        token_count_total: 150,
      },);
      expect(result,).toBe("gpt-4 · 150t",);
    });
  });
});

/** Minimal host exercising `sendWithPreferredMode` without a server. */
function buildPreferredModeHost(stream: boolean,) {
  const calls: string[] = [];
  return {
    calls,
    isGenerating: false,
    _streamResponses: stream,
    getStreamPreference(_chatId: string,) {
      return stream;
    },
    connectGenerationSSE(chatId: string,) {
      calls.push(`sse:${chatId}`,);
    },
    async checkGenerationStatus(_chatId: string,) {
      calls.push("status",);
    },
    async loadMessages() {
      calls.push("messages",);
    },
  };
}

describe("sendWithPreferredMode", () => {
  test("streaming on connects SSE without polling", async () => {
    const host = buildPreferredModeHost(true,);
    await chatGenerations.sendWithPreferredMode!.call(host as unknown as ChatState, "chat-1",);
    expect(host.calls,).toEqual(["sse:chat-1",],);
  });
  test("streaming off polls status then reloads without EventSource", async () => {
    const host = buildPreferredModeHost(false,);
    let done = false;
    await chatGenerations.sendWithPreferredMode!.call(host as unknown as ChatState, "chat-1", () => {
      done = true;
    },);
    expect(host.calls[0],).toBe("status",);
    expect(host.calls,).toContain("messages",);
    expect(host.calls.join(" ",),).not.toContain("sse:",);
    expect(done,).toBe(true,);
  });
});

// ── Generation SSE lifecycle (stale-guard + status poll + cancel) ──
let genHandler: ((url: string,) => Response) | null = null;
// Hoisted: chat-generations binds the stubbed apiFetch for the tests below.
mock.module("./htmx", () => ({
  apiFetch: async (url: string,) => {
    if (genHandler) { return genHandler(url,); }
    return new Response("{}", { status: 200, },);
  },
}),);

function jsonRes(body: unknown, status = 200,): Response {
  return new Response(JSON.stringify(body,), { status, },);
}

type Listener = (event: { data: string },) => void;

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  static readonly CLOSED = 2;
  listeners = new Map<string, Listener[]>();
  closed = false;
  readyState = 1;
  constructor(public url: string,) {
    FakeEventSource.instances.push(this,);
  }
  addEventListener(type: string, cb: Listener,) {
    const list = this.listeners.get(type,) ?? [];
    list.push(cb,);
    this.listeners.set(type, list,);
  }
  close() {
    this.closed = true;
    this.readyState = FakeEventSource.CLOSED;
  }
  emit(type: string, data = "",) {
    for (const cb of this.listeners.get(type,) ?? []) { cb({ data, },); }
  }
}

interface GenHost {
  activeChat: string | null;
  isGenerating: boolean;
  activeAttemptId: string | null;
  generationDetail: unknown;
  generationLabel: string;
  _generationEventSource: FakeEventSource | null;
  _streamContent: string;
  _streamToolCalls: string[];
  toasts: unknown[];
  loads: string[];
  $dispatch?(event: string, detail: unknown,): void;
  loadMessages(): Promise<void>;
  fireAutoQuickReplies(kind: string,): Promise<void>;
  renderStreamContainer(): void;
  _cleanupSSE(): void;
}

function genHost(): GenHost {
  const host: GenHost = {
    activeChat: "chat-1",
    isGenerating: false,
    activeAttemptId: null,
    generationDetail: null,
    generationLabel: "",
    _generationEventSource: null,
    _streamContent: "",
    _streamToolCalls: [],
    toasts: [],
    loads: [],
    $dispatch(_event: string, detail: unknown,) {
      host.toasts.push(detail,);
    },
    async loadMessages() {
      host.loads.push("messages",);
    },
    async fireAutoQuickReplies(kind: string,) {
      host.loads.push("auto:" + kind,);
    },
    renderStreamContainer: chatGenerations.renderStreamContainer!,
    _cleanupSSE: chatGenerations._cleanupSSE!,
  };
  return host;
}

function asState(host: GenHost,): ChatState {
  return host as unknown as ChatState;
}

async function flush(): Promise<void> {
  await new Promise<void>((resolve,) => {
    setTimeout(resolve, 0,);
  },);
}

const realEventSource = (globalThis as Record<string, unknown>)["EventSource"];
const realDocument = (globalThis as Record<string, unknown>)["document"];
const realPurify = (globalThis as Record<string, unknown>)["__DOMPurify"];

function stubGlobals(container: { innerHTML: string } | null, sanitize?: (html: string,) => string,) {
  (globalThis as Record<string, unknown>)["EventSource"] = FakeEventSource;
  FakeEventSource.instances = [];
  if (container && !(container as { replaceChildren?: unknown }).replaceChildren) {
    (container as { replaceChildren?: () => void }).replaceChildren = () => {};
  }
  (globalThis as Record<string, unknown>)["document"] = {
    querySelector: () => container,
    createElement: () => ({ textContent: "", }),
  };
  if (sanitize) {
    (globalThis as Record<string, unknown>)["__DOMPurify"] = { sanitize, };
  } else {
    delete (globalThis as Record<string, unknown>)["__DOMPurify"];
  }
}

beforeAll(() => {
  createLogger({ level: "error", },);
},);

afterAll(() => {
  (globalThis as Record<string, unknown>)["EventSource"] = realEventSource;
  (globalThis as Record<string, unknown>)["document"] = realDocument;
  if (realPurify === undefined) {
    delete (globalThis as Record<string, unknown>)["__DOMPurify"];
  } else {
    (globalThis as Record<string, unknown>)["__DOMPurify"] = realPurify;
  }
  genHandler = null;
},);

describe("connectGenerationSSE", () => {
  test("streams updates and tool calls into the container", () => {
    const container = { innerHTML: "", };
    const seen: string[] = [];
    stubGlobals(container, (html,) => {
      seen.push(html,);
      return "clean:" + html;
    },);
    const host = genHost();
    chatGenerations.connectGenerationSSE!.call(asState(host,), "chat-1",);
    expect(host.isGenerating,).toBe(true,);
    const es = FakeEventSource.instances[0]!;
    expect(es.url,).toBe("/api/generation/stream/chat-1",);
    es.emit("stream-update", "hello",);
    expect(host._streamContent,).toBe("hello",);
    expect(host.activeAttemptId,).toBe("chat-1",);
    es.emit("tool_call", "tc-1",);
    expect(host._streamToolCalls,).toEqual(["tc-1",],);
    expect(container.innerHTML,).toBe("clean:tc-1hello",);
    expect(seen.length,).toBeGreaterThan(0,);
  });
  test("done reloads on the current chat", async () => {
    stubGlobals({ innerHTML: "", }, (html,) => html,);
    const host = genHost();
    chatGenerations.connectGenerationSSE!.call(asState(host,), "chat-1",);
    FakeEventSource.instances[0]!.emit("stream-done",);
    await flush();
    expect(host.isGenerating,).toBe(false,);
    expect(host.loads,).toEqual(["messages", "auto:ai",],);
  });
  test("done skips reload after a chat switch (stale guard)", async () => {
    stubGlobals({ innerHTML: "", }, (html,) => html,);
    const host = genHost();
    chatGenerations.connectGenerationSSE!.call(asState(host,), "chat-1",);
    host.activeChat = "chat-2";
    FakeEventSource.instances[0]!.emit("stream-update", "late",);
    expect(host._streamContent,).toBe("",);
    FakeEventSource.instances[0]!.emit("stream-done",);
    await flush();
    expect(host.loads,).toEqual([],);
    expect(host._generationEventSource,).toBeNull();
  });
  test("stream-error toasts and resets", () => {
    stubGlobals({ innerHTML: "", }, (html,) => html,);
    const host = genHost();
    host.isGenerating = true;
    chatGenerations.connectGenerationSSE!.call(asState(host,), "chat-1",);
    FakeEventSource.instances[0]!.emit("stream-error", JSON.stringify({ error: "boom", },),);
    expect(host.isGenerating,).toBe(false,);
    expect(host.toasts.length,).toBe(1,);
  });
  test("hard close resets; non-terminal readyState is ignored", () => {
    stubGlobals({ innerHTML: "", }, (html,) => html,);
    const host = genHost();
    chatGenerations.connectGenerationSSE!.call(asState(host,), "chat-1",);
    const es = FakeEventSource.instances[0]!;
    es.readyState = 0;
    es.emit("error",);
    expect(host.isGenerating,).toBe(true,);
    es.readyState = FakeEventSource.CLOSED;
    es.emit("error",);
    expect(host.isGenerating,).toBe(false,);
  });
});

describe("checkGenerationStatus", () => {
  test("marks an active attempt with a progress label", async () => {
    stubGlobals(null,);
    genHandler = () =>
      jsonRes({
        isActive: true,
        attemptId: "a1",
        generation: { attemptId: "a1", status: "running", elapsedMs: 2000, chunksReceived: 2, charsReceived: 50, },
      },);
    const host = genHost();
    await chatGenerations.checkGenerationStatus!.call(asState(host,), "chat-1",);
    expect(host.isGenerating,).toBe(true,);
    expect(host.activeAttemptId,).toBe("a1",);
    expect(host.generationLabel,).toContain("Generating",);
  });
  test("active without detail clears the label state", async () => {
    stubGlobals(null,);
    genHandler = () => jsonRes({ isActive: true, attemptId: "a2", },);
    const host = genHost();
    await chatGenerations.checkGenerationStatus!.call(asState(host,), "chat-1",);
    expect(host.isGenerating,).toBe(true,);
    expect(host.generationDetail,).toBeNull();
  });
  test("a finished attempt reloads once", async () => {
    stubGlobals(null,);
    genHandler = () => jsonRes({ isActive: false, },);
    const host = genHost();
    host.activeAttemptId = "a1";
    await chatGenerations.checkGenerationStatus!.call(asState(host,), "chat-1",);
    expect(host.isGenerating,).toBe(false,);
    expect(host.loads,).toEqual(["messages",],);
  });
  test("idle without an attempt stays idle", async () => {
    stubGlobals(null,);
    genHandler = () => jsonRes({ isActive: false, },);
    const host = genHost();
    await chatGenerations.checkGenerationStatus!.call(asState(host,), "chat-1",);
    expect(host.activeAttemptId,).toBeNull();
    expect(host.loads,).toEqual([],);
  });
  test("a failed poll never rejects", async () => {
    stubGlobals(null,);
    genHandler = () => {
      throw new Error("down",);
    };
    const host = genHost();
    await chatGenerations.checkGenerationStatus!.call(asState(host,), "chat-1",);
    expect(host.isGenerating,).toBe(false,);
  });
});

describe("cancelGeneration", () => {
  test("warns without an active chat", async () => {
    stubGlobals(null,);
    const host = genHost();
    host.activeChat = null;
    await chatGenerations.cancelGeneration!.call(asState(host,),);
    expect(host.toasts.length,).toBe(1,);
  });
  test("clears flags on acknowledgement", async () => {
    stubGlobals(null,);
    genHandler = () => jsonRes({ ok: true, },);
    const host = genHost();
    host.isGenerating = true;
    host.activeAttemptId = "a1";
    await chatGenerations.cancelGeneration!.call(asState(host,),);
    expect(host.isGenerating,).toBe(false,);
    expect(host.activeAttemptId,).toBeNull();
    expect(host.toasts.length,).toBe(1,);
  });
  test("error toast on rejection", async () => {
    stubGlobals(null,);
    genHandler = () => jsonRes({ ok: false, error: "nope", },);
    const host = genHost();
    await chatGenerations.cancelGeneration!.call(asState(host,),);
    expect(host.isGenerating,).toBe(false,);
    expect(host.toasts.length,).toBe(1,);
  });
  test("network toast on throw", async () => {
    stubGlobals(null,);
    genHandler = () => {
      throw new Error("down",);
    };
    const host = genHost();
    await chatGenerations.cancelGeneration!.call(asState(host,),);
    expect(host.toasts.length,).toBe(1,);
  });
});

describe("renderStreamContainer", () => {
  test("no-ops without a container", () => {
    stubGlobals(null, (html,) => html,);
    const host = genHost();
    host._streamContent = "hi";
    chatGenerations.renderStreamContainer!.call(asState(host,),);
  });
  test("falls back to text when the sanitizer is missing", () => {
    const added: unknown[] = [];
    const container = {
      innerHTML: "",
      replaceChildren: (...kids: unknown[]) => {
        added.push(...kids,);
      },
    };
    stubGlobals(container,);
    const host = genHost();
    host._streamContent = "<b>hi</b>";
    chatGenerations.renderStreamContainer!.call(asState(host,),);
    expect(added.length,).toBe(1,);
  });
});

describe("cleanupSSE", () => {
  test("closes and clears stream state", () => {
    stubGlobals(null,);
    const host = genHost();
    const es = new FakeEventSource("x",);
    host._generationEventSource = es;
    host._streamToolCalls = ["tc",];
    host._streamContent = "buf";
    chatGenerations._cleanupSSE!.call(asState(host,),);
    expect(es.closed,).toBe(true,);
    expect(host._generationEventSource,).toBeNull();
    expect(host._streamToolCalls,).toEqual([],);
    expect(host._streamContent,).toBe("",);
  });
});
