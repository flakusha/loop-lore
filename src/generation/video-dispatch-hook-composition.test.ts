// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * B1 composition test: the video route registers the sibling's precise
 * release (releaseModelsForRender) on the gate seam via
 * setVideoPreDispatchHook — the hook is no longer the no-op.
 *
 * Static import (not dynamic): the module is known at author time, and
 * importing the route is the registration under test — a dynamic import
 * would hide the dependency. The `seen` fetch log names the global
 * replacement so no inline cast is needed.
 *
 * Synchronization is deterministic: the fetch stub is synchronous, dispatch
 * waits on real signals — never a guessed wall-clock duration.
 */
import { describe, expect, test, } from "bun:test";
import { dispatchThroughVideoGate, runVideoPreDispatchHook, } from "./video-dispatch-gate";
import "./video-gen-route";

describe("video dispatch gate — B1 composition", () => {
  test("route registration replaces the no-op with the precise release", async () => {
    // Prove the hook is the real release: it hits llama-swap's /running
    // (the no-op never fetches). Loopback base, unreachable swap ->
    // non-fatal, render still proceeds.
    const realFetch = globalThis.fetch;
    const seen: string[] = [];
    const stubFetch = async (url: string | URL | Request,) => {
      seen.push(String(url,),);
      throw new Error("conn refused",);
    };

    globalThis.fetch = stubFetch as unknown as typeof fetch;

    try {
      await runVideoPreDispatchHook("box-a",);
    } finally {
      globalThis.fetch = realFetch;
    }

    expect(seen.some((url,) => url.endsWith("/running",)),).toBe(true,);

    let ran = false;
    await dispatchThroughVideoGate({
      providers: [{ localBox: "box-a", },],
      run: async () => {
        ran = true;
      },
    },);

    expect(ran,).toBe(true,);
  });
});
