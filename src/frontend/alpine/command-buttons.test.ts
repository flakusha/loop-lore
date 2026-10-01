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

describe("commandButtons.filteredButtons", () => {
  let originalAlpine: { store: (n: string,) => unknown } | undefined;

  afterEach(() => {
    if (originalAlpine) {
      (globalThis as { Alpine?: { store: (n: string,) => unknown } }).Alpine = originalAlpine;
    } else {
      delete (globalThis as { Alpine?: { store: (n: string,) => unknown } }).Alpine;
    }
  },);

  it("returns every button for the owner role", () => {
    originalAlpine = (globalThis as { Alpine?: { store: (n: string,) => unknown } }).Alpine;
    (globalThis as { Alpine?: { store: (n: string,) => unknown } }).Alpine = {
      store: (name: string,) => (name === "ui" ? { userRole: "owner", } : {}),
    };
    const api = loadCommandButtons() as unknown as { filteredButtons: { role: string }[] };
    expect(api.filteredButtons.length,).toBe(19,);
    expect(api.filteredButtons.filter((b,) => b.role === "gm").length,).toBe(6,);
  });

  it("hides GM-only buttons for non-owner roles", () => {
    originalAlpine = (globalThis as { Alpine?: { store: (n: string,) => unknown } }).Alpine;
    (globalThis as { Alpine?: { store: (n: string,) => unknown } }).Alpine = {
      store: (name: string,) => (name === "ui" ? { userRole: "player", } : {}),
    };
    const api = loadCommandButtons() as unknown as { filteredButtons: { role: string }[] };
    expect(api.filteredButtons.length,).toBe(13,);
    expect(api.filteredButtons.filter((b,) => b.role === "gm").length,).toBe(0,);
  });

  it("falls back to non-GM buttons when Alpine is absent", () => {
    originalAlpine = (globalThis as { Alpine?: { store: (n: string,) => unknown } }).Alpine;
    delete (globalThis as { Alpine?: { store: (n: string,) => unknown } }).Alpine;
    const api = loadCommandButtons() as unknown as { filteredButtons: { role: string }[] };
    expect(api.filteredButtons.length,).toBe(13,);
  });

  it("falls back to non-GM buttons when the store lookup throws", () => {
    originalAlpine = (globalThis as { Alpine?: { store: (n: string,) => unknown } }).Alpine;
    (globalThis as { Alpine?: { store: (n: string,) => unknown } }).Alpine = {
      store: () => {
        throw new Error("store unavailable",);
      },
    };
    const api = loadCommandButtons() as unknown as { filteredButtons: { role: string }[] };
    expect(api.filteredButtons.length,).toBe(13,);
  });
});

describe("commandButtons.runCommand GM guidance and guards", () => {
  let originalAlpine: { store: (n: string,) => unknown } | undefined;
  let originalQuerySelector: typeof document.querySelector;
  let textArea: FakeTextArea;

  beforeEach(() => {
    originalAlpine = (globalThis as { Alpine?: { store: (n: string,) => unknown } }).Alpine;
    textArea = { value: "", focus: () => {}, dispatchEvent: () => true, };
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

  it("opens the GM guidance panel for cmd='guide'", () => {
    const ui: Record<string, unknown> = {};
    (globalThis as { Alpine?: { store: (n: string,) => unknown } }).Alpine = {
      store: (name: string,) => (name === "ui" ? ui : {}),
    };
    const api = loadCommandButtons();
    api.runCommand("guide",);
    expect(ui.showGmGuidance,).toBe(true,);
    expect(ui.showChatSettings,).toBe(true,);
    expect(textArea.value,).toBe("",);
  });

  it("no-ops for cmd='guide' when the ui store is missing", () => {
    (globalThis as { Alpine?: { store: (n: string,) => unknown } }).Alpine = {
      store: () => undefined,
    };
    const api = loadCommandButtons();
    api.runCommand("guide",);
    expect(textArea.value,).toBe("",);
  });

  it("no-ops for cmd='impersonate' when the chat store has no impersonate fn", () => {
    (globalThis as { Alpine?: { store: (n: string,) => unknown } }).Alpine = {
      store: () => ({}),
    };
    const api = loadCommandButtons();
    api.runCommand("impersonate",);
    expect(textArea.value,).toBe("",);
  });

  it("no-ops for slash commands when #message-input is absent", () => {
    (globalThis as { Alpine?: { store: (n: string,) => unknown } }).Alpine = {
      store: () => ({}),
    };
    document.querySelector = (() => null) as typeof document.querySelector;
    const api = loadCommandButtons();
    api.runCommand("image",);
    // The lookup happened but no input existed — nothing was typed.
    expect(textArea.value,).toBe("",);
  });
});

describe("commandButtons.toggleLabels", () => {
  it("flips showLabels and persists the choice", () => {
    const api = loadCommandButtons() as unknown as { toggleLabels: () => void; showLabels: boolean };
    const before = api.showLabels;
    api.toggleLabels();
    expect(api.showLabels,).toBe(!before,);
    expect(STORE["command-button-labels"],).toBe(api.showLabels ? "1" : "0",);
    api.toggleLabels();
    expect(api.showLabels,).toBe(before,);
    expect(STORE["command-button-labels"],).toBe(before ? "1" : "0",);
  });
});
