// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, describe, expect, it, } from "bun:test";
import type { LogEntry, Transport, } from "../../logger/types";
import { log as rootLog, } from "./logger";
import {
  __resetKeynavHandlersForTests,
  DEFAULT_KEYMAP,
  dispatchKeynavAction,
  dispatchKeynavActionToHandlers,
  getKeymap,
  isKeyboardNavEnabled,
  log as shortcutsLog,
  registerKeynavHandler,
} from "./shortcuts";

/** Entries captured by the shared recording transport. */
let captured: LogEntry[] = [];

/**
 * A recording transport, registered once at module load. `addTransport` only
 * pushes — there is no removal — so re-registering per test would duplicate
 * every entry. Entries pass through an async queue, so callers must `flush()`
 * before asserting.
 */
const captureTransport: Transport = {
  name: "test-capture",
  write: (entry: LogEntry,) => {
    captured.push(entry,);
    return Promise.resolve();
  },
  flush: () => Promise.resolve(),
};

rootLog.addTransport(captureTransport,);

/**
 * Run `fn`, drain the logger queue, and return what it logged. This is the only
 * way to assert the keynav catch block reaches the logger: a console.error stub
 * would only prove the old path is gone, not that the new one fires.
 */
async function captureLogEntries(fn: () => void,): Promise<LogEntry[]> {
  // Drain first: an earlier test may have left entries buffered in the child
  // logger's queue, and they would otherwise land in this test's window.
  await shortcutsLog.flush();
  await rootLog.flush();
  captured = [];
  fn();
  // Each logger instance owns its OWN AsyncLogQueue, so flushing the root does
  // not drain the queue the keynav child logger writes to.
  await shortcutsLog.flush();
  await rootLog.flush();
  return captured;
}

describe("shortcuts.ts", () => {
  describe("DEFAULT_KEYMAP", () => {
    it("contains all expected shortcut entries", () => {
      const combos = DEFAULT_KEYMAP.map((k,) => k.combo);
      expect(combos,).toContain("?",);
      expect(combos,).toContain("g g",);
      expect(combos,).toContain("g p",);
      expect(combos,).toContain("g c",);
      expect(combos,).toContain("g s",);
      expect(combos,).toContain("g a",);
      expect(combos,).toContain("g h",);
      expect(combos,).toContain("[",);
      expect(combos,).toContain("]",);
      expect(combos,).toContain("j",);
      expect(combos,).toContain("k",);
    });

    it("every entry has a non-empty action", () => {
      for (const entry of DEFAULT_KEYMAP) {
        expect(entry.action.length,).toBeGreaterThan(0,);
      }
    });

    it("ignoreInInput is true for j/k/[/] but false for g-prefixed combos", () => {
      const chatOnly = DEFAULT_KEYMAP.filter((k,) => k.ignoreInInput === true);
      const chatCombos = chatOnly.map((k,) => k.combo);
      expect(chatCombos,).toContain("j",);
      expect(chatCombos,).toContain("k",);
      expect(chatCombos,).toContain("[",);
      expect(chatCombos,).toContain("]",);

      const navEntries = DEFAULT_KEYMAP.filter((k,) => k.combo.startsWith("g ",));
      for (const entry of navEntries) {
        expect(entry.ignoreInInput,).not.toBe(true,);
      }
    });
  });

  describe("getKeymap()", () => {
    it("returns the DEFAULT_KEYMAP", () => {
      const km = getKeymap();
      expect(km,).toEqual(DEFAULT_KEYMAP,);
    });

    it("returns a new array each call (not the same reference)", () => {
      const km1 = getKeymap();
      const km2 = getKeymap();
      expect(km1,).not.toBe(km2,);
    });
  });

  describe("isKeyboardNavEnabled()", () => {
    it("returns a boolean without throwing when Alpine is absent", () => {
      const result = isKeyboardNavEnabled();
      expect(typeof result,).toBe("boolean",);
    });
  });

  // dispatchKeynavAction requires window — only run in DOM environment
  if (typeof window !== "undefined") {
    describe("dispatchKeynavAction()", () => {
      it("dispatches a CustomEvent with the action in detail", () => {
        const received = { detail: null as unknown, };
        const listener = (e: Event,) => {
          received.detail = (e as CustomEvent).detail;
        };
        window.addEventListener("keynav:action", listener,);
        dispatchKeynavAction("goto-chatlist",);
        expect(received.detail,).toEqual({ action: "goto-chatlist", },);
        window.removeEventListener("keynav:action", listener,);
      });

      it("event bubbles", () => {
        const received = { bubbles: null as unknown, };
        const listener = (e: Event,) => {
          received.bubbles = (e as CustomEvent).bubbles;
        };
        window.addEventListener("keynav:action", listener,);
        dispatchKeynavAction("toggle-help",);
        expect(received.bubbles,).toBe(true,);
        window.removeEventListener("keynav:action", listener,);
      });
    });
  }

  describe("registerKeynavHandler / dispatchKeynavActionToHandlers", () => {
    afterEach(() => {
      __resetKeynavHandlersForTests();
    },);

    it("registered handler is invoked when its action is dispatched", () => {
      let calls = 0;
      registerKeynavHandler("goto-chatlist", () => {
        calls += 1;
      },);
      dispatchKeynavActionToHandlers("goto-chatlist",);
      expect(calls,).toBe(1,);
    });

    it("returns an unsubscribe function that detaches the handler", () => {
      let calls = 0;
      const handler = () => {
        calls += 1;
      };
      const unsub = registerKeynavHandler("goto-chatlist", handler,);
      dispatchKeynavActionToHandlers("goto-chatlist",);
      unsub();
      dispatchKeynavActionToHandlers("goto-chatlist",);
      expect(calls,).toBe(1,);
    });

    it("multiple handlers on the same action all fire (registration order)", () => {
      const order: string[] = [];
      registerKeynavHandler("goto-chatlist", () => order.push("a",),);
      registerKeynavHandler("goto-chatlist", () => order.push("b",),);
      dispatchKeynavActionToHandlers("goto-chatlist",);
      expect(order,).toEqual(["a", "b",],);
    });

    it("stale unsubscribe does not delete the live handler set", () => {
      let calls = 0;
      const staleUnsub = registerKeynavHandler("goto-chatlist", () => {
        calls += 1;
      },);
      staleUnsub();
      const liveUnsub = registerKeynavHandler("goto-chatlist", () => {
        calls += 1;
      },);
      // The stale unsubscribe must not remove the replacement registration.
      staleUnsub();
      dispatchKeynavActionToHandlers("goto-chatlist",);
      expect(calls,).toBe(1,);
      liveUnsub();
    });

    it("dispatching an action with no handlers is a no-op", () => {
      expect(() => dispatchKeynavActionToHandlers("does-not-exist",)).not.toThrow();
    });

    it("handlers for other actions are not invoked", () => {
      let chatlistCalls = 0;
      let homeCalls = 0;
      registerKeynavHandler("goto-chatlist", () => {
        chatlistCalls += 1;
      },);
      registerKeynavHandler("goto-home", () => {
        homeCalls += 1;
      },);
      dispatchKeynavActionToHandlers("goto-chatlist",);
      expect(chatlistCalls,).toBe(1,);
      expect(homeCalls,).toBe(0,);
    });

    it("last-registered unsubscribe removes only that handler", () => {
      let a = 0;
      let b = 0;
      const unsubA = registerKeynavHandler("goto-chatlist", () => {
        a += 1;
      },);
      registerKeynavHandler("goto-chatlist", () => {
        b += 1;
      },);
      unsubA();
      dispatchKeynavActionToHandlers("goto-chatlist",);
      expect(a,).toBe(0,);
      expect(b,).toBe(1,);
    });

    it("a handler that throws does not prevent subsequent handlers from running", () => {
      const order: string[] = [];
      registerKeynavHandler("goto-chatlist", () => order.push("a",),);
      registerKeynavHandler("goto-chatlist", () => {
        throw new Error("boom",);
      },);
      registerKeynavHandler("goto-chatlist", () => order.push("c",),);
      // Should not throw out of dispatch.
      expect(() => dispatchKeynavActionToHandlers("goto-chatlist",)).not.toThrow();
      // Handlers after the throwing one must still fire.
      expect(order,).toEqual(["a", "c",],);
    });

    it("routes a thrown handler error to the logger, not console.error", async () => {
      const entries = await captureLogEntries(() => {
        registerKeynavHandler("goto-chatlist", () => {
          throw new Error("kaboom",);
        },);
        dispatchKeynavActionToHandlers("goto-chatlist",);
      },);

      const keynav = entries.filter((e,) => String(e.message,).includes("goto-chatlist",));
      expect(keynav.length,).toBe(1,);
      expect(String(keynav[0]!.message,),).toContain("threw",);
      expect(keynav[0]!.module,).toBe("shortcuts",);
      // The ORIGINAL Error must reach the logger, not a re-wrapped copy.
      // `error` is `error.stack ?? error.message`, and a re-wrapped
      // `new Error(String(err))` built inside the catch block would carry the
      // WHOLE call chain too — so merely finding this file in the stack proves
      // nothing. What separates them is the TOP frame: the original Error is
      // constructed in the handler, so its stack starts in the test file; the
      // re-wrap starts in shortcuts.ts.
      expect(keynav[0]!.error,).toContain("kaboom",);
      const topFrame = keynav[0]!.error!.split("\n",)[1] ?? "";
      expect(topFrame,).toContain("shortcuts.test.ts",);
    });

    it("normalizes a non-Error throw so the logger still receives an Error", async () => {
      const entries = await captureLogEntries(() => {
        registerKeynavHandler("goto-home", () => {
          throw "bare-string";
        },);
        dispatchKeynavActionToHandlers("goto-home",);
      },);

      const keynav = entries.filter((e,) => String(e.message,).includes("goto-home",));
      expect(keynav.length,).toBe(1,);
      expect(keynav[0]!.error,).toContain("bare-string",);
    });

    it("re-entrant registration during dispatch fires in the same dispatch", () => {
      let spawned = 0;
      registerKeynavHandler("goto-chatlist", () => {
        spawned += 1;
        // Handler re-registers itself mid-iteration.
        if (spawned === 1) {
          registerKeynavHandler("goto-chatlist", () => {
            spawned += 10;
          },);
        }
      },);
      dispatchKeynavActionToHandlers("goto-chatlist",);
      expect(spawned,).toBe(11,);
    });
  });

  // The global keydown listener (document.addEventListener) cannot be
  // exercised from bun:test — KeyboardEvent is not provided by bun's DOM
  // (document exists but lacks event constructors). End-to-end coverage
  // for the listener → handler wiring requires Playwright (or a jsdom-based
  // runner). See TASK-coverage-waiver-frontend-alpine-shortcuts-ts-at-36-under-che.
});
