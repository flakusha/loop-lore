// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression: WIRE-impersonate-command-palette-no-actionpayload-dispatch.
 * Ensures `runCommand("impersonate")` (and "char") dispatch to the chat
 * Alpine store's impersonate() method instead of typing a slash command
 * into the message input.
 */
import { afterEach, beforeEach, describe, expect, it, mock, } from "bun:test";

// Side-effect import: registers `(globalThis as ...).commandButtons` factory.
import "./command-buttons";

interface CommandButtonsApi {
  runCommand: (cmd: string,) => void;
}

interface FakeTextArea {
  value: string;
  focus: () => void;
  dispatchEvent: (e: Event,) => boolean;
}

const STORE: Record<string, string> = {};
const fakeStorage: Storage = {
  getItem: (k: string,) => STORE[k] ?? null,
  setItem: (k: string, v: string,) => {
    STORE[k] = v;
  },
  removeItem: (k: string,) => {
    delete STORE[k];
  },
  clear: () => {
    for (const k of Object.keys(STORE,)) { delete STORE[k]; }
  },
  key: (i: number,) => Object.keys(STORE,)[i] ?? null,
  get length() {
    return Object.keys(STORE,).length;
  },
};

(globalThis as unknown as { localStorage: Storage }).localStorage = fakeStorage;

// bun:test has no DOM; command-buttons.ts touches document at registration
// and runCommand looks up #message-input.
(globalThis as unknown as { document: Document }).document = {
  querySelector: () => null,
  addEventListener: () => {},
} as unknown as Document;

/** */
function loadCommandButtons(): CommandButtonsApi {
  const factory = (globalThis as unknown as { commandButtons?: () => CommandButtonsApi }).commandButtons;
  if (!factory) { throw new Error("commandButtons factory not registered",); }
  return factory();
}

describe("commandButtons.runCommand impersonate dispatch", () => {
  let impersonateMock: ReturnType<typeof mock>;
  let textArea: FakeTextArea;
  let originalAlpine: { store: (n: string,) => unknown } | undefined;
  let originalQuerySelector: typeof document.querySelector;

  beforeEach(() => {
    impersonateMock = mock(() => {},);
    originalAlpine = (globalThis as { Alpine?: { store: (n: string,) => unknown } }).Alpine;
    (globalThis as { Alpine?: { store: (n: string,) => unknown } }).Alpine = {
      store: (name: string,) => {
        if (name === "chat") {
          return { impersonate: impersonateMock, };
        }
        if (name === "ui") {
          return {};
        }
        return {};
      },
    };
    textArea = {
      value: "",
      focus: () => {},
      dispatchEvent: () => true,
    };
    originalQuerySelector = document.querySelector;
    document.querySelector = ((sel: string,) =>
      sel === "#message-input" ? (textArea as unknown as Element) : null) as typeof document.querySelector;
  },);

  afterEach(() => {
    if (originalAlpine) {
      (globalThis as { Alpine?: { store: (n: string,) => unknown } }).Alpine = originalAlpine;
    } else {
      delete (globalThis as { Alpine?: { store: (n: string,) => unknown } }).Alpine;
    }
    document.querySelector = originalQuerySelector;
  },);

  it("dispatches impersonate to chat store for cmd='impersonate'", () => {
    const api = loadCommandButtons();
    api.runCommand("impersonate",);
    expect(impersonateMock,).toHaveBeenCalledTimes(1,);
    expect(impersonateMock.mock.calls[0]?.[0],).toBe("impersonate",);
    expect(textArea.value,).toBe("",);
  });

  it("dispatches impersonate to chat store for cmd='char'", () => {
    const api = loadCommandButtons();
    api.runCommand("char",);
    expect(impersonateMock,).toHaveBeenCalledTimes(1,);
    expect(impersonateMock.mock.calls[0]?.[0],).toBe("char",);
    expect(textArea.value,).toBe("",);
  });

  it("still types a slash command into the input for non-dispatched cmds", () => {
    const api = loadCommandButtons();
    api.runCommand("image",);
    expect(impersonateMock,).not.toHaveBeenCalled();
    expect(textArea.value,).toBe("/image ",);
  });
});
