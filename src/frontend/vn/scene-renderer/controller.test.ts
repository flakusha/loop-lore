// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for frontend/vn/scene-renderer/controller.ts — renderer lifecycle,
 * navigation state transitions, and cleanup.
 *
 * Uses the shared fake DOM with a reduced-motion matchMedia stub so
 * transitions and typewriter effects resolve instantly; the floating render
 * promise is flushed with a zero-delay tick before DOM assertions.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { createStorageStub, type FakeDom, type FakeEl, installVnFakeDom, makeEl, tick, } from "../../tests/vn-fake-dom";
import {
  addScene,
  destroyVnRenderer,
  getCurrentSceneIndex,
  getSceneCount,
  initVnRenderer,
  jumpToScene,
  nextScene,
  prevScene,
} from "./controller";
import { state, } from "./state";
import type { VnMessage, } from "./types";

// ── Global stubs ────────────────────────────────────────────────────────────

type Globals = Record<string, unknown>;
const originalStorage = (globalThis as Globals).localStorage;
const originalAdd = (globalThis as Globals).addEventListener;
const originalRemove = (globalThis as Globals).removeEventListener;
let dom: FakeDom;
let added: Array<[string, unknown,]> = [];
let removed: Array<[string, unknown,]> = [];

beforeEach(() => {
  added = [];
  removed = [];
  dom = installVnFakeDom();
  (globalThis as Globals).localStorage = createStorageStub();
  (globalThis as Globals).addEventListener = (type: string, fn: unknown,) => void added.push([type, fn,],);
  (globalThis as Globals).removeEventListener = (type: string, fn: unknown,) => void removed.push([type, fn,],);
},);

afterEach(() => {
  destroyVnRenderer();
  dom.restore();
  (globalThis as Globals).localStorage = originalStorage;
  (globalThis as Globals).addEventListener = originalAdd;
  (globalThis as Globals).removeEventListener = originalRemove;
},);

// ── Fixture ─────────────────────────────────────────────────────────────────

function msg(id: string, content: string,): VnMessage {
  return { id, role: "assistant", content, };
}

const GM_CONFIG = { renderingOverride: "visual_novel", vnTypewriter: false, };

function initTwo(container: FakeEl, chatId?: string,): void {
  initVnRenderer(
    container as unknown as HTMLElement,
    [msg("m1", "First.",), msg("m2", "Second.",),],
    GM_CONFIG,
    chatId,
  );
}

function freshContainer(): FakeEl {
  return makeEl();
}

// ── Init ────────────────────────────────────────────────────────────────────

describe("initVnRenderer", () => {
  test("mounts the last scene and registers the location handler", async () => {
    const container = freshContainer();
    initTwo(container, "chat-9",);
    await tick();

    expect(getSceneCount(),).toBe(2,);
    expect(getCurrentSceneIndex(),).toBe(1,);
    expect(state.currentChatId,).toBe("chat-9",);

    expect(state.loadingIndicator,).not.toBeNull();
    const sceneEl = container.querySelector(".vn-scene",)!;
    expect(sceneEl.querySelector(".vn-text",)!.textContent,).toBe("Second.",);

    expect(container.querySelector(".vn-loading-indicator",),).not.toBeNull();

    expect(added.filter(([type,],) => type === "chat:location-changed"),).toHaveLength(1,);
    expect(state.locationChangeHandler,).not.toBeNull();
  });

  test("without chatId the state has no chat binding", async () => {
    const container = freshContainer();
    initTwo(container,);
    await tick();
    expect(state.currentChatId,).toBeNull();
    expect(container.querySelector(".vn-choices-container",),).toBeNull();
  });

  test("re-init unsubscribes the previous location handler first", () => {
    initTwo(freshContainer(),);
    initTwo(freshContainer(),);

    expect(added,).toHaveLength(2,);
    expect(removed,).toHaveLength(1,);
    expect(removed[0]![1],).toBe(added[0]![1],);
  });

  test("with zero messages it mounts no scene and keeps the indicator", async () => {
    const container = freshContainer();
    initVnRenderer(
      container as unknown as HTMLElement,
      [],
      GM_CONFIG,
    );
    await tick();

    expect(getSceneCount(),).toBe(0,);
    expect(container.querySelector(".vn-scene",),).toBeNull();
    expect(container.querySelector(".vn-loading-indicator",),).not.toBeNull();
  });
});

// ── Navigation ──────────────────────────────────────────────────────────────

describe("navigation", () => {
  test("next stops at the last scene; prev stops at the first", async () => {
    initTwo(freshContainer(),);
    await tick();

    nextScene();
    expect(getCurrentSceneIndex(),).toBe(1,);

    prevScene();
    expect(getCurrentSceneIndex(),).toBe(0,);
    prevScene();
    expect(getCurrentSceneIndex(),).toBe(0,);
  });

  test("nav buttons drive the same transitions", async () => {
    const container = freshContainer();
    initTwo(container,);
    await tick();

    container.querySelector(".vn-scene",)!.querySelector(".vn-prev",)!.dispatch("click",);
    expect(getCurrentSceneIndex(),).toBe(0,);

    const fresh = container.querySelector(".vn-scene",)!;
    fresh.querySelector(".vn-next",)!.dispatch("click",);
    expect(getCurrentSceneIndex(),).toBe(1,);
  });

  test("jumpToScene accepts only in-range indexes", () => {
    initTwo(freshContainer(),);

    jumpToScene(-1,);
    expect(getCurrentSceneIndex(),).toBe(1,);
    jumpToScene(2,);
    expect(getCurrentSceneIndex(),).toBe(1,);
    jumpToScene(Number.NaN,);
    expect(getCurrentSceneIndex(),).toBe(1,);

    jumpToScene(0,);
    expect(getCurrentSceneIndex(),).toBe(0,);
  });

  test("addScene appends the message and jumps to it", () => {
    initTwo(freshContainer(),);

    addScene(msg("m3", "Third.",),);
    expect(getSceneCount(),).toBe(3,);
    expect(getCurrentSceneIndex(),).toBe(2,);
    expect(state.scenes[2]!.text,).toBe("Third.",);
  });
});

// ── Destroy ─────────────────────────────────────────────────────────────────

describe("destroyVnRenderer", () => {
  test("clears DOM, unsubscribes, and resets every state field", async () => {
    const container = freshContainer();
    initTwo(container, "chat-1",);
    await tick();

    destroyVnRenderer();

    expect(container.children,).toHaveLength(0,);
    expect(removed.some(([type,],) => type === "chat:location-changed"),).toBe(true,);
    expect(state.container,).toBeNull();
    expect(state.scenes,).toEqual([],);
    expect(state.currentIndex,).toBe(0,);
    expect(state.settings,).toBeNull();
    expect(state.currentChatId,).toBeNull();
    expect(state.loadingIndicator,).toBeNull();
    expect(state.locationChangeHandler,).toBeNull();
  });

  test("destroy without init is a safe no-op", () => {
    expect(() => destroyVnRenderer()).not.toThrow();
    expect(state.container,).toBeNull();
  });
});
