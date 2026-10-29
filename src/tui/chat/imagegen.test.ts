// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for tui/chat/api.ts — generateImage / uploadAsset / send-with-attachments.
 * Global fetch is stubbed; no network is touched.
 */
import { afterEach, describe, expect, it, } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { TUI_DEFAULTS, } from "../../config/sections/tui";
import { generateImage, handleSend, uploadAsset, } from "./api";
import type { ChatHost, ChatMessage, } from "./types";

interface Captured {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  isForm: boolean;
}

const originalFetch = globalThis.fetch;
const CAPTURE_KEY = "__tui_imagegen_captured__" as const;

interface CaptureGlobal {
  [CAPTURE_KEY]?: Captured[];
}

function makeHost(overrides: Partial<ChatHost> = {},): ChatHost {
  return {
    requestRender: () => {},
    chatId: "chat-1",
    messages: [],
    isSending: false,
    sessionToken: undefined,
    sendTimeoutMs: TUI_DEFAULTS.sendTimeoutMs,
    addMessage(_message: ChatMessage,) {},
    setMessages(_messages: ChatMessage[],) {},
    scrollToBottom() {/* no-op */},
    showTyping() {/* no-op */},
    hideTyping() {/* no-op */},
    showError(_message: string,) {/* no-op */},
    ...overrides,
  };
}

function headersToRecord(init: HeadersInit | undefined,): Record<string, string> {
  if (!init) { return {}; }
  if (init instanceof Headers) {
    const out: Record<string, string> = {};
    init.forEach((value, key,) => {
      out[key] = value;
    },);

    return out;
  }

  if (Array.isArray(init,)) {
    const out: Record<string, string> = {};
    for (const [key, value,] of init) { out[key] = value; }
    return out;
  }

  return { ...init, };
}

function stubFetchJson(status: number, payload: unknown,): void {
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit,) => {
    recordRequest(url, init,);
    return new Response(JSON.stringify(payload,), {
      status,
      headers: { "Content-Type": "application/json", },
    },);
  }) as unknown as typeof fetch;
}

function recordRequest(url: string | URL | Request, init: RequestInit | undefined,): void {
  const log = (globalThis as CaptureGlobal)[CAPTURE_KEY] ?? [];
  log.push({
    url: String(url,),
    method: (init?.method ?? "GET").toUpperCase(),
    headers: headersToRecord(init?.headers,),
    body: typeof init?.body === "string" ? init?.body : "",
    isForm: typeof FormData !== "undefined" && init?.body instanceof FormData,
  },);

  (globalThis as CaptureGlobal)[CAPTURE_KEY] = log;
}

function getCaptured(): Captured {
  const cap = ((globalThis as CaptureGlobal)[CAPTURE_KEY] ?? []).at(-1,);
  if (!cap) { throw new Error("No captured request — fetch stub was not invoked",); }
  return cap;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete (globalThis as CaptureGlobal)[CAPTURE_KEY];
},);

describe("generateImage", () => {
  it("errors without fetching when no chatId is set", async () => {
    globalThis.fetch = (() => {
      throw new Error("fetch must not be called",);
    }) as unknown as typeof fetch;

    const result = await generateImage(makeHost({ chatId: null, },), "a cat",);
    expect(result,).toEqual({ ok: false, error: "No active chat. Create or select a chat first.", },);
  });

  it("errors without fetching on a blank prompt", async () => {
    globalThis.fetch = (() => {
      throw new Error("fetch must not be called",);
    }) as unknown as typeof fetch;

    const result = await generateImage(makeHost(), "   ",);
    expect(result.ok,).toBe(false,);
  });

  it("POSTs prompt + chatId and returns the generated assets", async () => {
    const assets = [{ id: "a-1", url: "/assets/a-1", filename: "cat.png", mimeType: "image/png", },];
    stubFetchJson(200, { data: assets, },);
    const result = await generateImage(makeHost({ sessionToken: "tok", },), "a cat",);
    expect(result,).toEqual({ ok: true, assets, },);
    const captured = getCaptured();
    expect(captured.url,).toBe("http://localhost:3000/api/v1/generation/image",);
    expect(captured.method,).toBe("POST",);
    expect(captured.headers["authorization"],).toBe("Bearer tok",);
    expect(JSON.parse(captured.body,),).toEqual({ prompt: "a cat", chatId: "chat-1", },);
  });

  it("reports HTTP failures as an error line", async () => {
    stubFetchJson(403, { error: "forbidden", },);
    const result = await generateImage(makeHost(), "a cat",);
    expect(result,).toEqual({ ok: false, error: "Image generation failed (HTTP 403)", },);
  });
});

describe("uploadAsset", () => {
  it("errors without fetching on a blank path", async () => {
    globalThis.fetch = (() => {
      throw new Error("fetch must not be called",);
    }) as unknown as typeof fetch;

    const result = await uploadAsset(makeHost(), "  ",);
    expect(result.ok,).toBe(false,);
  });

  it("errors on an unreadable file without fetching", async () => {
    globalThis.fetch = (() => {
      throw new Error("fetch must not be called",);
    }) as unknown as typeof fetch;

    const result = await uploadAsset(makeHost(), "/no/such/file-xyz.png",);
    expect(result.ok,).toBe(false,);
  });

  it("POSTs multipart FormData and returns the asset id", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tui-upload-",),);
    try {
      const path = join(dir, "pic.png",);
      writeFileSync(path, Buffer.from([137, 80, 78, 71,],),);
      stubFetchJson(201, { id: "asset-9", },);
      const result = await uploadAsset(makeHost({ sessionToken: "tok", },), path,);
      expect(result,).toEqual({ ok: true, assetId: "asset-9", },);
      const captured = getCaptured();
      expect(captured.url,).toBe("http://localhost:3000/api/v1/assets",);
      expect(captured.method,).toBe("POST",);
      expect(captured.headers["authorization"],).toBe("Bearer tok",);
      expect(captured.isForm,).toBe(true,);
    } finally {
      rmSync(dir, { recursive: true, },);
    }
  });
});

describe("handleSend with attachments", () => {
  it("includes the attachments array in the message body when provided", async () => {
    stubFetchJson(200, { id: "msg-1", assistantMessage: { id: "msg-2", content: "seen", }, },);
    const host = makeHost();
    await handleSend(host, "look", [{ assetId: "asset-9", },],);
    const captured = getCaptured();
    expect(JSON.parse(captured.body,),).toEqual({
      content: "look",
      role: "user",
      attachments: [{ assetId: "asset-9", },],
    },);
  });

  it("omits attachments from the body when none are given", async () => {
    stubFetchJson(200, { id: "msg-1", assistantMessage: { id: "msg-2", content: "seen", }, },);
    const host = makeHost();
    await handleSend(host, "look",);
    const captured = getCaptured();
    expect(JSON.parse(captured.body,),).toEqual({ content: "look", role: "user", },);
  });
});
