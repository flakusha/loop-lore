// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for tui/chat-picker.ts — the chat picker overlay.
 *
 * `loadChats` is driven through the module's own `setFetch` seam rather than
 * `mock.module`, which leaks across files in a shared bun process.
 *
 * `ChatPicker` itself is built from `ChatPicker.prototype` with hand-injected
 * widget stubs instead of `new ChatPicker(screen)`: the real constructor calls
 * blessed.box/list/text, which need a live screen. This is the same approach
 * asset-view.test.ts uses, and because no `mock.module` is involved these
 * tests RUN in a plain shared `bun test src/tui/` rather than sitting behind
 * the ISOLATED gate.
 */
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { safeFetch, } from "../utils";
import type { FetchResult, SafeFetchOptions, } from "../utils/safe-fetch/types";
import { createChat, } from "./chat-create-api";
import { ChatPicker, CREATE_STATUS, loadChats, NO_CHATS_MESSAGE, setCreateChat, setFetch, } from "./chat-picker";
import type { ChatSummary, } from "./chat-picker";

interface RecordedCall {
  url: string;
  options: SafeFetchOptions;
}

const calls: RecordedCall[] = [];
const realFetch = safeFetch;
const realCreateChat = createChat;

beforeEach(() => {
  calls.length = 0;
},);

afterEach(() => {
  setFetch(realFetch,);
  setCreateChat(realCreateChat,);
},);

/**
 * Install a stub answering every call with `payload`.
 * Generic over the response body so it satisfies `setFetch`'s
 * `<T>(url, options?) => Promise<FetchResult<T>>` signature, the same shape
 * harness/api.test.ts's `makeMockSafeFetch<T>` uses.
 * @param payload - value placed in the success envelope's `data`
 */
function stubClient(payload: unknown,): void {
  setFetch(<T,>(url: string, options?: SafeFetchOptions,): Promise<FetchResult<T>> => {
    calls.push({ url, options: options ?? {}, },);
    return Promise.resolve({
      ok: true,
      data: payload as T,
      status: 200,
      headers: new Headers(),
    },);
  },);
}

const TWO_CHATS = {
  data: [
    { id: "aaaaaaaa-1111", name: "Sunken Keep", type: "group", is_pinned: "unpinned", },
    { id: "bbbbbbbb-2222", name: "Night Market", type: "direct", is_pinned: "pinned", },
  ],
};

// ── Widget stubs ────────────────────────────────────────────────────────

interface ListStub {
  items: string[];
  content: string;
  setItems(items: string[],): void;
  setContent(content: string,): void;
  focus(): void;
}

interface LabelStub {
  content: string;
  setContent(content: string,): void;
}

interface BoxStub {
  shown: boolean;
  show(): void;
  hide(): void;
}

interface ScreenStub {
  renders: number;
  render(): void;
}

/**
 * The picker as the tests drive it: the real prototype methods plus the
 * private fields `refresh`/`show`/`dismiss` read off `this`, bound to stubs.
 *
 * One `unknown` hop on the way in: intersecting `ChatPicker` with a private
 * field bag collapses to `never` (the same names are private on the class), so
 * the seam is declared once, here, rather than at every use.
 */
interface PickerUnderTest {
  screen: ScreenStub;
  box: BoxStub;
  list: ListStub;
  statusLabel: LabelStub;
  chats: ChatSummary[];
  visible: boolean;
  sessionToken: string | undefined;
  onSelect: (chatId: string,) => void;
  onHide: (() => void) | undefined;
  refresh(): Promise<void>;
  hide(): void;
  dismiss(): boolean;
  isVisible(): boolean;
  creating: boolean;
  prompt: PromptStub | null;
  startCreate(): void;
  commitCreate(name: string,): Promise<void>;
  cancelCreate(): void;
  isCreating(): boolean;
}

/**
 * Build a picker without running its blessed constructor.
 * @param selected - ids reported through `onSelect`, in call order
 * @returns the real prototype bound to stub widgets
 */
function buildPicker(selected: string[] = [],): PickerUnderTest {
  const picker = Object.create(ChatPicker.prototype,) as unknown as PickerUnderTest;
  picker.screen = {
    renders: 0,
    render(): void {
      this.renders++;
    },
  };

  picker.box = {
    shown: false,
    show(): void {
      this.shown = true;
    },
    hide(): void {
      this.shown = false;
    },
  };

  picker.list = {
    items: [],
    content: "",
    setItems(items: string[],): void {
      this.items = items;
    },
    setContent(content: string,): void {
      this.content = content;
    },
    focus(): void {/* no-op */},
  };

  picker.statusLabel = {
    content: "",
    setContent(content: string,): void {
      this.content = content;
    },
  };

  picker.chats = [];
  picker.visible = false;
  picker.creating = false;
  picker.prompt = null;
  picker.sessionToken = undefined;
  picker.onSelect = (chatId: string,) => {
    selected.push(chatId,);
  };

  picker.onHide = undefined;

  return picker;
}

// ── Prompt stub ─────────────────────────────────────────────────────────

interface PromptStub {
  emitted: string[];
  hidden: boolean;
  emit(event: string,): void;
  hide(): void;
  setValue(value: string,): void;
  show(): void;
  focus(): void;
  readInput(): void;
}

function promptStub(): PromptStub {
  return {
    emitted: [],
    hidden: false,
    emit(event: string,): void {
      this.emitted.push(event,);
    },
    hide(): void {
      this.hidden = true;
    },
    setValue(_value: string,): void {/* no-op */},
    show(): void {/* no-op */},
    focus(): void {/* no-op */},
    readInput(): void {/* no-op */},
  };
}

describe("loadChats", () => {
  it("requests the auth-guarded chat list endpoint", async () => {
    stubClient(TWO_CHATS,);
    await loadChats(undefined,);

    expect(calls[0]?.url,).toContain("/api/v1/chats",);
    expect(calls[0]?.options.auth,).toBeUndefined();
  });

  it("sends the session token as auth when one is supplied", async () => {
    stubClient(TWO_CHATS,);
    await loadChats("tok-1",);

    expect(calls[0]?.options.auth,).toEqual({ sessionToken: "tok-1", },);
  });

  it("unwraps the paginated envelope", async () => {
    stubClient(TWO_CHATS,);
    const result = await loadChats("tok-1",);

    expect(result.ok,).toBe(true,);
    expect(result.ok && result.data.length,).toBe(2,);
  });
});

describe("ChatPicker", () => {
  it("renders one row per chat", async () => {
    stubClient(TWO_CHATS,);
    const picker = buildPicker();

    await picker.refresh();

    expect(picker.list.items.length,).toBe(2,);
    expect(picker.list.items[0],).toContain("Sunken Keep",);
    expect(picker.list.items[1],).toContain("Night Market",);
    expect(picker.list.items[1],).toContain("[pinned]",);
  });

  it("reports the selected chat id through onSelect", async () => {
    stubClient(TWO_CHATS,);
    const selected: string[] = [];
    const picker = buildPicker(selected,);

    await picker.refresh();
    // Mirrors blessed handing `select` the row INDEX (harness/index.ts).
    picker.onSelect(picker.chats[1]?.id ?? "",);

    expect(selected,).toEqual(["bbbbbbbb-2222",],);
  });

  it("renders the empty-state text when there are no chats", async () => {
    stubClient({ data: [], },);
    const picker = buildPicker();

    await picker.refresh();

    expect(picker.list.items,).toEqual([],);
    expect(picker.list.content,).toBe(NO_CHATS_MESSAGE,);
    expect(picker.statusLabel.content,).toBe(NO_CHATS_MESSAGE,);
  });

  it("surfaces a load failure instead of an empty list", async () => {
    setFetch(<T,>(): Promise<FetchResult<T>> =>
      Promise.resolve({
        ok: false,
        error: new Error("nope",),
        status: 401,
        headers: new Headers(),
      } as FetchResult<T>,)
    );

    const picker = buildPicker();

    await picker.refresh();

    expect(picker.list.items,).toEqual([],);
    expect(picker.list.content,).toContain("Failed to load chats",);
  });

  it("dismisses without quitting when visible", () => {
    const picker = buildPicker();
    picker.visible = true;

    expect(picker.dismiss(),).toBe(true,);
    expect(picker.isVisible(),).toBe(false,);
    expect(picker.box.shown,).toBe(false,);
  });

  it("reports no dismissal when hidden, so the key falls through to quit", () => {
    const picker = buildPicker();

    expect(picker.isVisible(),).toBe(false,);
    expect(picker.dismiss(),).toBe(false,);
  });
});

describe("ChatPicker create flow", () => {
  it("setCreateChat seam swaps the create caller", async () => {
    const selected: string[] = [];
    const picker = buildPicker(selected,);
    const stub = (): Promise<{ ok: true; chatId: string }> => Promise.resolve({ ok: true, chatId: "stubbed-chat", },);
    setCreateChat(stub as typeof createChat,);

    await picker.commitCreate("Test Chat",);

    expect(selected,).toEqual(["stubbed-chat",],);
  });

  it("startCreate shows the prompt and sets the status", () => {
    const picker = buildPicker();
    picker.prompt = promptStub();

    picker.startCreate();

    expect(picker.prompt,).not.toBeNull();
    expect(picker.statusLabel.content,).toBe(CREATE_STATUS,);
  });

  it("commitCreate calls the create API and invokes onSelect on success", async () => {
    const selected: string[] = [];
    const picker = buildPicker(selected,);
    const stub = (): Promise<{ ok: true; chatId: string }> => Promise.resolve({ ok: true, chatId: "new-chat-1", },);
    setCreateChat(stub as typeof createChat,);

    await picker.commitCreate("My New Chat",);

    expect(selected,).toEqual(["new-chat-1",],);
    expect(picker.isCreating(),).toBe(false,);
  });

  it("commitCreate shows error on failure", async () => {
    const selected: string[] = [];
    const picker = buildPicker(selected,);
    const stub = (): Promise<{ ok: false; error: string }> =>
      Promise.resolve({ ok: false, error: "Name already exists", },);

    setCreateChat(stub as typeof createChat,);

    await picker.commitCreate("My New Chat",);

    expect(picker.statusLabel.content,).toBe("Name already exists",);
    expect(selected,).toEqual([],);
    expect(picker.isCreating(),).toBe(false,);
  });

  it("cancelCreate cleans up the prompt", () => {
    const picker = buildPicker();
    const prompt = promptStub();
    picker.prompt = prompt;

    picker.cancelCreate();

    expect(picker.prompt,).toBeNull();
    expect(prompt.emitted,).toContain("blur",);
    expect(prompt.hidden,).toBe(true,);
    expect(picker.statusLabel.content,).toBe(NO_CHATS_MESSAGE,);
  });

  it("isCreating transitions through the commit cycle", async () => {
    const picker = buildPicker();
    let resolveCreate: (value: { ok: true; chatId: string },) => void = () => {};
    const createPromise = new Promise<{ ok: true; chatId: string }>((resolve,) => {
      resolveCreate = resolve;
    },);

    setCreateChat(() => createPromise);

    expect(picker.isCreating(),).toBe(false,);

    const commitPromise = picker.commitCreate("Test",);

    expect(picker.isCreating(),).toBe(true,);

    resolveCreate({ ok: true, chatId: "deferred-chat", },);
    await commitPromise;

    expect(picker.isCreating(),).toBe(false,);
  });

  it("creating resets on rejection (try/finally)", async () => {
    const picker = buildPicker();
    const stub = (): Promise<{ ok: true; chatId: string }> => Promise.reject(new Error("network down",),);
    setCreateChat(stub as typeof createChat,);

    try {
      await picker.commitCreate("Test",);
    } catch {
      // expected — the error propagates after finally resets creating
    }

    expect(picker.isCreating(),).toBe(false,);
  });

  it("onHide fires on dismiss", () => {
    const picker = buildPicker();
    let hideCount = 0;
    picker.onHide = () => {
      hideCount++;
    };

    picker.visible = true;

    picker.dismiss();

    expect(hideCount,).toBe(1,);
  });

  it("onHide fires on hide", () => {
    const picker = buildPicker();
    let hideCount = 0;
    picker.onHide = () => {
      hideCount++;
    };

    picker.visible = true;

    picker.hide();

    expect(hideCount,).toBe(1,);
  });

  it("cancelCreate restores correct footer when chats exist", () => {
    const picker = buildPicker();
    picker.chats = [{ id: "x", name: "A", type: "direct", is_pinned: "unpinned", },];
    picker.prompt = promptStub();

    picker.cancelCreate();

    expect(picker.statusLabel.content,).toBe("1 chat(s) | Enter: bind chat | Esc: close",);
  });
});
