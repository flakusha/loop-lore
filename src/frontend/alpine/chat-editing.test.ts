import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { chatEditing, } from "./chat-editing";
// chat-editing.ts calls the global apiFetch, which htmx.ts installs on
// globalThis at import time — import it so the real request chain runs.
import "./htmx";
import type { ChatState, } from "./types";

const mockMessage = (id: string, content: string, role: string,) => ({
  id,
  content,
  role,
  created_at: new Date().toISOString(),
});

type MockEditState = Pick<ChatState, "messages" | "editingMessageId" | "editContent" | "pendingAssets">;

describe("chatEditing", () => {
  describe("startEdit", () => {
    test("sets editingMessageId and editContent for matching message", () => {
      const mockState: MockEditState = {
        messages: [
          mockMessage("msg-1", "Hello world", "user",),
          mockMessage("msg-2", "Hi there", "assistant",),
        ],
        editingMessageId: null,
        editContent: "",
        pendingAssets: [],
      };

      chatEditing.startEdit!.call(mockState, "msg-1",);

      expect(mockState.editingMessageId,).toBe("msg-1",);
      expect(mockState.editContent,).toBe("Hello world",);
    });

    test("does nothing when message not found", () => {
      const mockState: MockEditState = {
        messages: [mockMessage("msg-1", "Hello", "user",),],
        editingMessageId: null,
        editContent: "",
        pendingAssets: [],
      };

      chatEditing.startEdit!.call(mockState, "msg-99",);

      expect(mockState.editingMessageId,).toBeNull();
      expect(mockState.editContent,).toBe("",);
    });

    test("handles empty messages array", () => {
      const mockState: MockEditState = {
        messages: [],
        editingMessageId: null,
        editContent: "",
        pendingAssets: [],
      };

      chatEditing.startEdit!.call(mockState, "msg-1",);

      expect(mockState.editingMessageId,).toBeNull();
      expect(mockState.editContent,).toBe("",);
    });
  });

  describe("cancelEdit", () => {
    test("resets editing state", () => {
      const mockState: MockEditState = {
        messages: [],
        editingMessageId: "msg-1",
        editContent: "some text",
        pendingAssets: [],
      };

      chatEditing.cancelEdit!.call(mockState,);

      expect(mockState.editingMessageId,).toBeNull();
      expect(mockState.editContent,).toBe("",);
    });

    test("works when no edit is active", () => {
      const mockState: MockEditState = {
        messages: [],
        editingMessageId: null,
        editContent: "",
        pendingAssets: [],
      };

      expect(() => chatEditing.cancelEdit!.call(mockState,)).not.toThrow();
      expect(mockState.editingMessageId,).toBeNull();
      expect(mockState.editContent,).toBe("",);
    });
  });

  describe("removePendingAsset", () => {
    test("removes asset by id", () => {
      const mockState: MockEditState = {
        messages: [],
        editingMessageId: null,
        editContent: "",
        pendingAssets: [
          { assetId: "asset-1", filename: "img1.png", },
          { assetId: "asset-2", filename: "img2.png", },
          { assetId: "asset-3", filename: "img3.png", },
        ],
      };

      chatEditing.removePendingAsset!.call(mockState, "asset-2",);

      expect(mockState.pendingAssets.length,).toBe(2,);
      expect(mockState.pendingAssets[0]?.assetId,).toBe("asset-1",);
      expect(mockState.pendingAssets[1]?.assetId,).toBe("asset-3",);
    });

    test("does nothing for non-existent asset id", () => {
      const mockState: MockEditState = {
        messages: [],
        editingMessageId: null,
        editContent: "",
        pendingAssets: [{ assetId: "asset-1", filename: "img1.png", },],
      };

      chatEditing.removePendingAsset!.call(mockState, "asset-99",);

      expect(mockState.pendingAssets.length,).toBe(1,);
    });

    test("handles empty pending assets", () => {
      const mockState: MockEditState = {
        messages: [],
        editingMessageId: null,
        editContent: "",
        pendingAssets: [],
      };

      chatEditing.removePendingAsset!.call(mockState, "asset-1",);

      expect(mockState.pendingAssets.length,).toBe(0,);
    });
  });
});

// ── API flows (saveEdit / removeMessage / copyMessage / handleAttach) ──
// These methods delegate to apiFetch (./htmx) → feFetch → globalThis.fetch,
// so the tests stub fetch and let the real request chain run.

interface SwappedGlobals {
  confirm?: unknown;
  navigator?: unknown;
}

type MockApiState = {
  activeChat: string | null;
  messages: { id: string; content: string; role: string; created_at: string }[];
  editingMessageId: string | null;
  editContent: string;
  pendingAssets: { assetId: string; filename: string }[];
  $dispatch?: (name: string, detail: { type: string; message: string },) => void;
};

function makeState(overrides: Partial<MockApiState> = {},): MockApiState {
  return {
    activeChat: "chat-1",
    messages: [mockMessage("msg-1", "Hello world", "assistant",),],
    editingMessageId: null,
    editContent: "",
    pendingAssets: [],
    ...overrides,
  };
}

type Toast = { type: string; message: string };

function makeStateWithToasts(state: MockApiState,): { state: MockApiState; toasts: Toast[] } {
  const toasts: Toast[] = [];
  state.$dispatch = (_name: string, detail: Toast,) => {
    toasts.push(detail,);
  };
  return { state, toasts, };
}

describe("chatEditing API flows", () => {
  const realFetch = globalThis.fetch;
  // Capture and restore, never `delete`. Six production modules call the bare
  // global `confirm`, and `delete` would strip it from every later test file.
  const realConfirm = (globalThis as SwappedGlobals).confirm;
  const realNavigator = (globalThis as SwappedGlobals).navigator;
  const realLocaleStrings = (globalThis as Record<string, unknown>).__localeStrings;
  let fetchCalls: { url: string; init?: RequestInit }[] = [];
  let fetchImpl: (url: string, init?: RequestInit,) => Promise<Response> = () =>
    Promise.resolve(new Response("{}", { status: 200, },),);

  beforeEach(() => {
    fetchCalls = [];
    fetchImpl = () => Promise.resolve(new Response("{}", { status: 200, },),);
    (globalThis as Record<string, unknown>).__localeStrings = {};
    globalThis.fetch = ((url: string, init?: RequestInit,) => {
      fetchCalls.push({ url, init, },);
      return fetchImpl(url, init,);
    }) as unknown as typeof fetch;
  },);

  afterEach(() => {
    globalThis.fetch = realFetch;
    (globalThis as SwappedGlobals).confirm = realConfirm;
    (globalThis as { navigator?: unknown }).navigator = realNavigator;
    (globalThis as Record<string, unknown>).__localeStrings = realLocaleStrings;
  },);

  describe("saveEdit", () => {
    test("patches the message and shows a success toast on ok", async () => {
      const { state, toasts, } = makeStateWithToasts(makeState({
        editContent: "  Updated text  ",
      },),);
      await chatEditing.saveEdit!.call(state, "msg-1",);
      expect(fetchCalls.length,).toBe(1,);
      expect(fetchCalls[0]?.url,).toBe("/api/v1/messages/msg-1",);
      const init = fetchCalls[0]?.init;
      expect(init?.method,).toBe("PATCH",);
      expect(JSON.parse(String(init?.body,),).content,).toBe("Updated text",);
      expect(state.messages[0]?.content,).toBe("Updated text",);
      expect(toasts,).toEqual([{ type: "success", message: "toasts.messageEdited", },],);
    });

    test("does nothing when there is no active chat", async () => {
      const { state, toasts, } = makeStateWithToasts(makeState({
        activeChat: null,
        editContent: "text",
      },),);
      await chatEditing.saveEdit!.call(state, "msg-1",);
      expect(fetchCalls.length,).toBe(0,);
      expect(toasts.length,).toBe(0,);
    });

    test("does nothing when the edit content is blank", async () => {
      const { state, toasts, } = makeStateWithToasts(makeState({
        editContent: "   ",
      },),);
      await chatEditing.saveEdit!.call(state, "msg-1",);
      expect(fetchCalls.length,).toBe(0,);
      expect(toasts.length,).toBe(0,);
    });

    test("a 400 rejection shows the save-failed toast, not a network error", async () => {
      fetchImpl = () =>
        Promise.resolve(
          new Response(JSON.stringify({ error: "nope", },), { status: 400, },),
        );
      const { state, toasts, } = makeStateWithToasts(makeState({ editContent: "text", },),);
      await chatEditing.saveEdit!.call(state, "msg-1",);
      expect(toasts,).toEqual([{ type: "error", message: "toasts.failedSaveEdit", },],);
    });

    test("a failed save does not half-update the stored message", async () => {
      fetchImpl = () =>
        Promise.resolve(
          new Response(JSON.stringify({ error: "nope", },), { status: 400, },),
        );
      const { state, toasts, } = makeStateWithToasts(makeState({ editContent: "text", },),);
      await chatEditing.saveEdit!.call(state, "msg-1",);
      // The server still holds "Hello world"; local state must not claim "text".
      expect(state.messages[0]?.content,).toBe("Hello world",);
      expect(state.editingMessageId,).toBe(null,);
      expect(toasts[0]?.type,).toBe("error",);
    });

    test("shows the network error toast when fetch throws", async () => {
      fetchImpl = () => Promise.reject(new Error("boom",),);
      const { state, toasts, } = makeStateWithToasts(makeState({ editContent: "text", },),);
      await chatEditing.saveEdit!.call(state, "msg-1",);
      expect(toasts,).toEqual([{ type: "error", message: "toasts.networkErrorSavingEdit", },],);
    });
  });

  describe("removeMessage", () => {
    test("removes the message, toasts, and stops propagation on ok", async () => {
      (globalThis as { confirm?: unknown }).confirm = () => true;
      let stopped = false;
      const { state, toasts, } = makeStateWithToasts(makeState(),);
      await chatEditing.removeMessage!.call(state, "msg-1", {
        stopImmediatePropagation: () => {
          stopped = true;
        },
      } as unknown as Event,);
      expect(fetchCalls[0]?.url,).toBe("/api/v1/messages/msg-1",);
      expect(fetchCalls[0]?.init?.method,).toBe("DELETE",);
      expect(state.messages.length,).toBe(0,);
      expect(stopped,).toBe(true,);
      expect(toasts,).toEqual([{ type: "success", message: "toasts.messageRemoved", },],);
    });

    test("does nothing when the confirm dialog is declined", async () => {
      (globalThis as { confirm?: unknown }).confirm = () => false;
      const { state, toasts, } = makeStateWithToasts(makeState(),);
      await chatEditing.removeMessage!.call(state, "msg-1", {
        stopImmediatePropagation: () => {},
      } as unknown as Event,);
      expect(fetchCalls.length,).toBe(0,);
      expect(state.messages.length,).toBe(1,);
      expect(toasts.length,).toBe(0,);
    });

    test("does nothing when there is no active chat", async () => {
      (globalThis as { confirm?: unknown }).confirm = () => true;
      const { state, toasts, } = makeStateWithToasts(makeState({ activeChat: null, },),);
      await chatEditing.removeMessage!.call(state, "msg-1", {
        stopImmediatePropagation: () => {},
      } as unknown as Event,);
      expect(fetchCalls.length,).toBe(0,);
      expect(toasts.length,).toBe(0,);
    });

    test("a 403 rejection keeps the message and shows the remove-failed toast", async () => {
      (globalThis as { confirm?: unknown }).confirm = () => true;
      fetchImpl = () =>
        Promise.resolve(
          new Response(JSON.stringify({ error: "cannot delete", },), { status: 403, },),
        );
      const { state, toasts, } = makeStateWithToasts(makeState(),);
      await chatEditing.removeMessage!.call(state, "msg-1", {
        stopImmediatePropagation: () => {},
      } as unknown as Event,);
      expect(state.messages.length,).toBe(1,);
      expect(toasts,).toEqual([{ type: "error", message: "toasts.failedRemove", },],);
    });

    test("shows the network error toast when fetch throws", async () => {
      (globalThis as { confirm?: unknown }).confirm = () => true;
      fetchImpl = () => Promise.reject(new Error("boom",),);
      const { state, toasts, } = makeStateWithToasts(makeState(),);
      await chatEditing.removeMessage!.call(state, "msg-1", {
        stopImmediatePropagation: () => {},
      } as unknown as Event,);
      expect(toasts,).toEqual([{ type: "error", message: "toasts.networkErrorRemovingMessage", },],);
    });
  });

  describe("copyMessage", () => {
    test("writes the content to the clipboard and blurs the button", async () => {
      const writeText = (content: string,) => {
        expect(content,).toBe("Hello world",);
        return Promise.resolve();
      };
      (globalThis as { navigator?: unknown }).navigator = { clipboard: { writeText, }, };
      const button = {
        blurred: false,
        blur() {
          this.blurred = true;
        },
      };
      const { state, toasts, } = makeStateWithToasts(makeState(),);
      await chatEditing.copyMessage!.call(state, "msg-1", {
        currentTarget: button,
      } as unknown as Event,);
      expect(toasts,).toEqual([{ type: "success", message: "toasts.copiedToClipboard", },],);
      expect(button.blurred,).toBe(true,);
    });

    test("shows the error toast when the clipboard rejects", async () => {
      (globalThis as { navigator?: unknown }).navigator = {
        clipboard: {
          writeText: () => Promise.reject(new Error("denied",),),
        },
      };
      const { state, toasts, } = makeStateWithToasts(makeState(),);
      await chatEditing.copyMessage!.call(state, "msg-1", {
        currentTarget: null,
      } as unknown as Event,);
      expect(toasts,).toEqual([{ type: "error", message: "toasts.failedCopy", },],);
    });

    test("does nothing when the message is not found", async () => {
      let clipboardCalled = false;
      (globalThis as { navigator?: unknown }).navigator = {
        clipboard: {
          writeText: () => {
            clipboardCalled = true;
            return Promise.resolve();
          },
        },
      };
      const { state, toasts, } = makeStateWithToasts(makeState(),);
      await chatEditing.copyMessage!.call(state, "missing", {
        currentTarget: null,
      } as unknown as Event,);
      expect(clipboardCalled,).toBe(false,);
      expect(toasts.length,).toBe(0,);
    });
  });

  describe("handleAttach", () => {
    test("uploads each file and appends to pendingAssets", async () => {
      fetchImpl = (url: string,) => {
        expect(url,).toBe("/api/v1/assets",);
        return Promise.resolve(
          new Response(JSON.stringify({ id: "asset-9", },), { status: 200, },),
        );
      };
      const file1 = new File(["a",], "one.png", { type: "image/png", },);
      const file2 = new File(["b",], "two.png", { type: "image/png", },);
      const input = { files: [file1, file2,], value: "/tmp/x", };
      const { state, toasts, } = makeStateWithToasts(makeState(),);
      // t() returns the raw key without a locale catalog — install one so
      // the {filename} interpolation path is exercised.
      const realLocaleStrings = (globalThis as Record<string, unknown>).__localeStrings;
      (globalThis as Record<string, unknown>).__localeStrings = {
        toasts: { readyToAttach: "Ready: {filename}", },
      };
      try {
        await chatEditing.handleAttach!.call(state, {
          target: input,
        } as unknown as Event,);
      } finally {
        (globalThis as Record<string, unknown>).__localeStrings = realLocaleStrings;
      }
      expect(fetchCalls.length,).toBe(2,);
      expect(state.pendingAssets,).toEqual([
        { assetId: "asset-9", filename: "one.png", },
        { assetId: "asset-9", filename: "two.png", },
      ],);
      expect(input.value,).toBe("",);
      expect(toasts.length,).toBe(2,);
      expect(toasts[0]?.type,).toBe("success",);
      expect(toasts[0]?.message,).toContain("one.png",);
    });

    test("shows a warning toast when there is no active chat", async () => {
      const { state, toasts, } = makeStateWithToasts(makeState({ activeChat: null, },),);
      await chatEditing.handleAttach!.call(state, {
        target: { files: [new File(["a",], "x.png",),], value: "", },
      } as unknown as Event,);
      expect(fetchCalls.length,).toBe(0,);
      expect(toasts,).toEqual([{ type: "warning", message: "toasts.selectChatFirst", },],);
    });

    test("does nothing when the input has no files", async () => {
      const { state, toasts, } = makeStateWithToasts(makeState(),);
      await chatEditing.handleAttach!.call(state, {
        target: { files: [], value: "", },
      } as unknown as Event,);
      expect(fetchCalls.length,).toBe(0,);
      expect(toasts.length,).toBe(0,);
    });

    test("a 413 rejection shows the upload-failed toast, not a network error", async () => {
      fetchImpl = () =>
        Promise.resolve(
          new Response(JSON.stringify({ error: "too large", },), { status: 413, },),
        );
      const { state, toasts, } = makeStateWithToasts(makeState(),);
      (globalThis as Record<string, unknown>).__localeStrings = {
        toasts: { failedUpload: "Failed to upload {filename}", },
      };
      await chatEditing.handleAttach!.call(state, {
        target: { files: [new File(["a",], "big.png",),], value: "", },
      } as unknown as Event,);
      // A rejected upload must not leave a phantom pending asset behind.
      expect(state.pendingAssets.length,).toBe(0,);
      expect(toasts,).toEqual([{ type: "error", message: "Failed to upload big.png", },],);
    });

    test("shows the network error toast when fetch throws", async () => {
      fetchImpl = () => Promise.reject(new Error("boom",),);
      const { state, toasts, } = makeStateWithToasts(makeState(),);
      await chatEditing.handleAttach!.call(state, {
        target: { files: [new File(["a",], "x.png",),], value: "", },
      } as unknown as Event,);
      expect(toasts,).toEqual([{ type: "error", message: "toasts.networkErrorUploading", },],);
    });
  });
});
