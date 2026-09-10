// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for frontend/vn/scene-renderer/render.ts — scene mapping, image
 * preloading, and the location-change fade. `Image` is stubbed with an
 * auto-loading fake; timers are driven by awaiting observable style changes.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { makeAttachment, tick, } from "../../tests/vn-fake-dom";
import { clearCache, type LoadingIndicator, } from "../image-preloader";
import { handleLocationChanged, msgToScene, preloadCurrentAndUpcoming, } from "./render";
import { state, } from "./state";
import type { VnMessage, VnScene, } from "./types";

const DEFAULTS_STATE = {
  scenes: [] as VnScene[],
  currentIndex: 0,
  container: null as unknown,
  settings: null as unknown,
  currentChatId: null as string | null,
  loadingIndicator: null as unknown,
  locationChangeHandler: null as unknown,
};
const originalImage = (globalThis as Record<string, unknown>).Image;
beforeEach(() => {
  Object.assign(state, DEFAULTS_STATE,);
  clearCache();
  FakeImage.created = [];
  (globalThis as Record<string, unknown>).Image = FakeImage;
},);

afterEach(() => {
  Object.assign(state, DEFAULTS_STATE,);
  (globalThis as Record<string, unknown>).Image = originalImage;
},);

// ── Helpers ─────────────────────────────────────────────────────────────────

function msg(overrides: Partial<VnMessage> = {},): VnMessage {
  return { id: "m1", role: "assistant", content: "Hello there.", ...overrides, };
}

function scene(overrides: Partial<VnScene> = {},): VnScene {
  return { messageId: "m1", characterName: "Hero", text: "Hello there.", role: "assistant", ...overrides, };
}

/** Recording loading-indicator stub: show/hide counts plus progress pairs. */
interface Tracker extends LoadingIndicator {
  calls: Array<[number, number,]>;
  shown: number;
  hidden: number;
}

function tracker(): Tracker {
  const t: Tracker = {
    calls: [],
    shown: 0,
    hidden: 0,
    show: () => void t.shown++,
    hide: () => void t.hidden++,
    updateProgress: (loaded: number, total: number,) => void t.calls.push([loaded, total,],),
  };
  return t;
}

/** Auto-loading Image stub: "broken" URLs fire error, everything else load. */
class FakeImage {
  static created: FakeImage[] = [];
  #src = "";
  #listeners = new Map<string, Array<() => void>>();

  constructor() {
    FakeImage.created.push(this,);
  }

  get src(): string {
    return this.#src;
  }

  set src(value: string,) {
    this.#src = value;
    queueMicrotask(() => {
      for (const fn of this.#listeners.get(value.includes("broken",) ? "error" : "load",) ?? []) { fn(); }
    },);
  }

  addEventListener(type: string, fn: () => void,): void {
    this.#listeners.set(type, [...(this.#listeners.get(type,) ?? []), fn,],);
  }
}

/** Await an observable condition; polls the timer queue without fixed sleeps. */
async function until(cond: () => boolean, maxMs = 2000,): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (!cond()) {
    if (Date.now() > deadline) { throw new Error("condition not met before deadline",); }
    await tick();
  }
}

// ── msgToScene ──────────────────────────────────────────────────────────────

describe("msgToScene", () => {
  test("maps message fields onto a scene", () => {
    const attachments: VnScene["attachments"] = [makeAttachment("a1", "",),];
    const result = msgToScene(msg({
      name: "Mira",
      content: "Hi!",
      thinking: "hmm",
      avatar_asset_id: "av1",
      background_url: "bg.png",
      attachments,
    },),);

    expect(result,).toEqual({
      messageId: "m1",
      backgroundUrl: "bg.png",
      characterName: "Mira",
      characterAvatar: "av1",
      text: "Hi!",
      thinking: "hmm",
      role: "assistant",
      attachments,
      cast: [{ characterId: "mira", name: "Mira", avatarAssetId: "av1", },],
      speakerId: "mira",
      emotion: undefined,
    },);
  });

  test("falls back to a role default when no name is present", () => {
    for (
      const [role, fallback,] of [["user", "You",], ["system", "System",], ["assistant", "Character",], [
        "narration",
        "Character",
      ],] as const
    ) {
      expect(msgToScene(msg({ role, },),).characterName,).toBe(fallback,);
    }
  });

  test("narration carries no speaker and an empty cast", () => {
    const result = msgToScene(msg({ role: "narration", },),);
    expect(result.speakerId,).toBeNull();
    expect(result.cast,).toEqual([],);
  });
});

// ── preloadCurrentAndUpcoming ───────────────────────────────────────────────

describe("preloadCurrentAndUpcoming", () => {
  function armPreload(t: Tracker, scenes: VnScene[],): void {
    state.loadingIndicator = t;
    state.currentIndex = 0;
    state.scenes = scenes;
  }

  test("no indicator or no scenes is a no-op", async () => {
    const t = tracker();

    state.loadingIndicator = null;
    state.scenes = [scene({ backgroundUrl: "bg.png", },),];
    await preloadCurrentAndUpcoming();

    state.loadingIndicator = t;
    state.scenes = [];
    await preloadCurrentAndUpcoming();

    expect(t.shown,).toBe(0,);
    expect(t.calls,).toEqual([],);
  });

  test("preloads the current-upcoming window, caches repeats, reports progress", async () => {
    const t = tracker();
    armPreload(t, [
      scene({ backgroundUrl: "bg0.png", characterAvatar: "av0", },),
      scene({ messageId: "m2", backgroundUrl: "bg1.png", },),
      scene({ messageId: "m3", backgroundUrl: "bg2.png", },),
      scene({ messageId: "m4", backgroundUrl: "bg3.png", },),
    ],);

    await preloadCurrentAndUpcoming();
    // Window is current + next 2 scenes; scene 4 (bg3) is outside it.
    expect(FakeImage.created.map((img,) => img.src).sort(),).toEqual(
      ["/api/assets/av0/thumb", "bg0.png", "bg1.png", "bg2.png",].sort(),
    );
    expect(t.shown,).toBe(1,);
    expect(t.calls,).toEqual([[4, 4,],],);
    await until(() => t.hidden > 0);

    await preloadCurrentAndUpcoming();
    expect(FakeImage.created,).toHaveLength(4,);
    expect(t.calls,).toEqual([[4, 4,], [4, 4,],],);
  });

  test("failed loads count against progress but still resolve", async () => {
    const t = tracker();
    armPreload(t, [scene({ backgroundUrl: "broken.png", },), scene({ messageId: "m2", backgroundUrl: "ok.png", },),],);

    await preloadCurrentAndUpcoming();
    expect(t.calls,).toEqual([[1, 2,],],);
  });
});

// ── handleLocationChanged ───────────────────────────────────────────────────

describe("handleLocationChanged", () => {
  function mountScene(): { sceneEl: HTMLElement & { isConnected: boolean } } {
    const sceneEl = { style: {}, isConnected: true, } as unknown as HTMLElement & { isConnected: boolean };
    state.container = {
      querySelector: (sel: string,): HTMLElement | null => sel === ".vn-scene" ? sceneEl : null,
    } as unknown as HTMLElement;
    state.settings = { layout: "split", } as unknown as typeof state.settings;
    return { sceneEl, };
  }

  function event(detail: Record<string, unknown>,): Event {
    return new globalThis.CustomEvent("chat:location-changed", { detail, },) as unknown as Event;
  }

  test("fades the active scene out, in, and back to rest state", async () => {
    const { sceneEl, } = mountScene();
    state.currentChatId = "chat-1";

    handleLocationChanged(event({ chatId: "chat-1", },),);
    expect(sceneEl.style.opacity,).toBe("0",);
    expect(sceneEl.style.transition,).toContain("opacity",);

    await until(() => sceneEl.style.opacity === "1");
    await until(() => sceneEl.style.transition === "");
  });

  test("ignores events for other chats or an unmounted renderer", () => {
    const { sceneEl, } = mountScene();
    state.currentChatId = "chat-1";

    handleLocationChanged(event({ chatId: "chat-2", },),);
    expect(sceneEl.style.opacity,).toBeUndefined();

    state.settings = null;
    handleLocationChanged(event({ chatId: "chat-1", },),);
    expect(sceneEl.style.opacity,).toBeUndefined();

    state.settings = { layout: "split", } as unknown as typeof state.settings;
    state.container = null;
    handleLocationChanged(event({ chatId: "chat-1", },),);
    expect(sceneEl.style.opacity,).toBeUndefined();
  });

  test("leaves opacity out when the scene was unmounted mid-transition", async () => {
    const { sceneEl, } = mountScene();
    state.currentChatId = "chat-1";

    handleLocationChanged(event({ chatId: "chat-1", },),);
    sceneEl.isConnected = false;

    // The restore timer only touches connected scenes; bun:test has no fake
    // timers, so wait out the 260ms window once and assert nothing changed.
    await new Promise<void>((resolve,) => setTimeout(resolve, 320,));
    expect(sceneEl.style.opacity,).toBe("0",);
    expect(sceneEl.style.transition,).toContain("opacity",);
  });
});
