// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ChatWidget (pi-tui): transcript rows, typing placeholder, submission
 * dispatch (send / /image / /upload), completion strip + Tab, and focus
 * requests. Pure component — the setFetch seam of chat/api backs the network
 * paths.
 */
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { join, } from "node:path";
import { safeFetch, } from "../../utils";
import type { FetchResult, SafeFetchOptions, } from "../../utils/safe-fetch/types";
import { type Component, KeybindingsManager, setKeybindings, TUI_KEYBINDINGS, } from "../pi";
import { stripRows, tick, } from "../test-support";
import { setFetch, } from "./api";
import { ChatWidget, } from "./index";
import type { ChatWidgetOptions, } from "./types";

const realFetch = safeFetch;
const calls: { url: string; options: SafeFetchOptions }[] = [];

function ok<T,>(data: T,): Promise<FetchResult<T>> {
  return Promise.resolve({ ok: true, data, status: 200, headers: new Headers(), },);
}

function route(): void {
  setFetch(<T,>(url: string, options?: SafeFetchOptions,): Promise<FetchResult<T>> => {
    calls.push({ url, options: options ?? {}, },);
    if (url.endsWith("/messages",)) {
      return ok({ id: "m-1", assistantMessage: { id: "m-2", content: "hi", }, } as T,);
    }

    if (url.includes("/commands",)) {
      return ok({ data: [{ name: "help", }, { name: "halt", },], } as T,);
    }

    if (url.endsWith("/generation/image",)) {
      return ok({ data: [{ id: "a-1", filename: "out.png", },], } as T,);
    }

    if (url.endsWith("/assets",) && options?.method === "POST") {
      return ok({ id: "up-1", } as T,);
    }

    return ok({} as T,);
  },);
}

beforeEach(() => {
  setKeybindings(new KeybindingsManager(TUI_KEYBINDINGS,),);
  route();
},);

afterEach(() => {
  calls.length = 0;
  setFetch(realFetch,);
},);

function build(overrides: ChatWidgetOptions = {},): ChatWidget {
  return new ChatWidget({ onRequestRender: () => {}, ...overrides, },);
}

describe("ChatWidget transcript", () => {
  it("addMessage appends a formatted row", () => {
    const chat = build();
    chat.addMessage({ id: "m1", role: "user", content: "hello", },);
    expect(chat.transcriptLines,).toEqual(["{bold}user{/bold}: hello",],);
    expect(chat.itemCount,).toBe(1,);
  });

  it("prefers actorName over role", () => {
    const chat = build();
    chat.addMessage({ id: "m2", role: "assistant", content: "hi", actorName: "Alice", },);
    expect(chat.transcriptLines,).toEqual(["{bold}Alice{/bold}: hi",],);
  });

  it("setMessages replaces the transcript wholesale", () => {
    const chat = build();
    chat.setMessages([
      { id: "1", role: "user", content: "one", },
      { id: "2", role: "assistant", content: "two", },
    ],);

    expect(chat.itemCount,).toBe(2,);
    chat.clearMessages();
    expect(chat.itemCount,).toBe(0,);
  });

  it("showTyping/hideTyping keep exactly one placeholder, removed by row", () => {
    const chat = build();
    chat.addMessage({ id: "1", role: "user", content: "one", },);
    chat.showTyping();
    chat.showTyping(); // second call replaces, not duplicates
    expect(chat.itemCount,).toBe(2,);
    chat.addMessage({ id: "2", role: "assistant", content: "two", },);
    chat.hideTyping();
    expect(chat.transcriptLines,).toEqual([
      "{bold}user{/bold}: one",
      "{bold}assistant{/bold}: two",
    ],);
  });

  it("showError appends a red error row", () => {
    const chat = build();
    chat.showError("boom",);
    expect(chat.transcriptLines[0],).toContain("{red-fg}⚠ Error: boom{/red-fg}",);
    expect(chat.itemCount,).toBe(1,);
  });

  it("render lays out transcript, strip and framed input", () => {
    const chat = build();
    chat.setBodyHeight(10,);
    chat.addMessage({ id: "1", role: "user", content: "hello", },);
    const rows = stripRows(chat.render(40,),);
    expect(rows.length,).toBeLessThanOrEqual(10,);
    expect(rows.join("\n",),).toContain("user: hello",);
    expect(rows.at(-3,),).toContain("┌",); // input frame top
    expect(rows.at(-1,),).toContain("└",); // input frame bottom
  });
});

describe("ChatWidget submission", () => {
  it("Enter sends the trimmed value and clears the input", async () => {
    const chat = build({ sessionToken: "tok", },);
    chat.setChatId("chat-1",);
    await tick();

    chat.input.setValue("  hello  ",);
    chat.input.submit();
    await tick(2,);

    expect(calls.some((call,) => call.url.endsWith("/chat-1/messages",) && call.options.method === "POST"),).toBe(
      true,
    );

    expect(chat.input.getValue(),).toBe("",);
    expect(chat.messages.map((m,) => m.content),).toContain("hello",);
  });

  it("blank submissions dispatch nothing", async () => {
    const chat = build();
    chat.setChatId("chat-1",);
    chat.input.setValue("   ",);
    chat.input.submit();
    await tick();
    expect(calls,).toEqual([],);
  });

  it("submissions while a send is in flight are ignored", async () => {
    const { promise, resolve, } = Promise.withResolvers<void>();
    setFetch(<T,>(): Promise<FetchResult<T>> => promise.then(() => ok({} as T,)));

    const chat = build();
    chat.setChatId("chat-1",);
    chat.input.setValue("first",);
    chat.input.submit();
    chat.input.setValue("second",);
    chat.input.submit();
    await tick();

    expect(chat.isSending,).toBe(true,);
    expect(chat.input.getValue(),).toBe("second",);

    resolve();
    await tick(2,);
    expect(chat.isSending,).toBe(false,);
  });

  it("/image dispatches the image flow and reports in-transcript", async () => {
    const refreshed: number[] = [];
    const chat = build({ onAssetsRefresh: () => refreshed.push(1,), },);
    chat.setChatId("chat-1",);
    await tick();

    chat.input.setValue("/image a castle",);
    chat.input.submit();
    await tick(2,);
    await tick();

    expect(refreshed,).toHaveLength(1,);
    expect(chat.transcriptLines.some((row,) => row.includes("Image ready: out.png",)),).toBe(true,);
  });

  it("/upload links the asset when a linker is wired", async () => {
    const linked: string[] = [];
    const chat = build({
      linkAsset: async (assetId,) => {
        linked.push(assetId,);
        return true;
      },
    },);

    chat.setChatId("chat-1",);
    await tick();

    const uploadPath = join(import.meta.dir, "../../.tmp/upload-fixture.txt",);
    await Bun.write(uploadPath, "payload",);
    chat.input.setValue(`/upload ${uploadPath}`,);
    chat.input.submit();
    // The flow chains readUploadFile -> fetch -> linkAsset -> addMessage,
    // so it needs a deeper settle than the single-request paths.
    for (let i = 0; i < 50; i++) {
      await tick();
    }

    expect(linked,).toEqual(["up-1",],);
    expect(chat.transcriptLines.some((row,) => row.includes("Uploaded up-1",)),).toBe(true,);
  });
});

describe("ChatWidget focus + completion", () => {
  it("focusInput asks the host to focus the input field", () => {
    const focused: Component[] = [];
    const chat = build({ onFocusRequest: (target,) => focused.push(target,), },);
    chat.focusInput();
    expect(focused.at(-1,),).toBe(chat.input,);
    expect(chat.isInputFocused(),).toBe(true,);
  });

  it("Tab with no completion switches input <-> transcript", () => {
    const focused: Component[] = [];
    const chat = build({ onFocusRequest: (target,) => focused.push(target,), },);
    chat.handleTab();
    expect(chat.isInputFocused(),).toBe(false,);
    expect(focused.at(-1,),).toBe(chat.transcript,);
    chat.handleTab();
    expect(chat.isInputFocused(),).toBe(true,);
    expect(focused.at(-1,),).toBe(chat.input,);
  });

  it("Tab cycles the slash-command strip once a `/` is typed", async () => {
    const chat = build();
    chat.setChatId("chat-1",);
    await tick(2,);

    chat.input.setValue("/h",);
    chat.input.onChange?.();
    await tick(2,);

    const withHint = stripRows(chat.render(60,),).join("\n",);
    expect(withHint,).toContain("/help",);

    chat.handleTab(); // cycles instead of switching focus
    expect(chat.isInputFocused(),).toBe(true,);
  });

  it("setChatId clears the transcript and notifies the host", () => {
    const changed: string[] = [];
    const chat = build({ onChatChange: (chatId,) => changed.push(chatId,), },);
    chat.addMessage({ id: "1", role: "user", content: "old", },);
    chat.setChatId("chat-9",);
    expect(changed,).toEqual(["chat-9",],);
    expect(chat.itemCount,).toBe(0,);
    expect(chat.getChatId(),).toBe("chat-9",);
  });

  it("empty-string session tokens run anonymous", () => {
    const chat = build({ sessionToken: "", },);
    expect(chat.sessionToken,).toBeUndefined();
  });
});
