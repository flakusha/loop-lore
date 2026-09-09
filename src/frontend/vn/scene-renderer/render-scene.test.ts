// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for frontend/vn/scene-renderer/render-scene.ts — renderCurrentScene
 * DOM construction, navigation wiring, and click behavior.
 *
 * Elements come from the shared fake DOM; they record class names, styles,
 * text, and listeners so structure and side effects are asserted on real
 * constructed trees.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { type FakeDom, type FakeEl, installVnFakeDom, makeAttachment, makeEl, } from "../../tests/vn-fake-dom";
import { renderCurrentScene, type SceneNavigator, } from "./render-scene";
import { state, } from "./state";
import type { VnScene, } from "./types";

let dom: FakeDom;

beforeEach(() => {
  dom = installVnFakeDom();
  state.scenes = [];
  state.currentIndex = 0;
  state.container = null;
  state.settings = null;
  state.currentChatId = null;
  state.loadingIndicator = null;
},);

afterEach(() => {
  dom.restore();
},);

// ── Fixture ─────────────────────────────────────────────────────────────────

const SETTINGS = {
  enabled: true,
  layout: "split",
  imageScaling: "auto",
  transition: "fade",
  typewriter: false,
  typewriterSpeed: 30,
  autoAdvance: false,
  autoAdvanceDelay: 5,
  dialogueBoxOpacity: 0.75,
  portraitSize: 35,
  splitRatio: 40,
} as const;

function baseScene(overrides: Partial<VnScene> = {},): VnScene {
  return {
    messageId: "m1",
    characterName: "Mira",
    text: "Well met.",
    role: "assistant",
    ...overrides,
  };
}

function install(scenes: VnScene[], index: number, opts: { chatId?: string; typewriter?: boolean } = {},): FakeEl {
  const container = makeEl();
  state.container = container as unknown as HTMLElement;
  state.settings = { ...SETTINGS, typewriter: opts.typewriter ?? false, };
  state.scenes = scenes;
  state.currentIndex = index;
  state.currentChatId = opts.chatId ?? null;
  return container;
}

function spyNavigator(): { nav: SceneNavigator; next: number[]; prev: number[] } {
  const next: number[] = [];
  const prev: number[] = [];
  return { nav: { next: () => void next.push(1,), prev: () => void prev.push(1,), }, next, prev, };
}

// ── Structure ───────────────────────────────────────────────────────────────

describe("renderCurrentScene structure", () => {
  test("builds background, portrait, dialogue, and nav for the current scene", async () => {
    const container = install([
      baseScene({ backgroundUrl: "bg.png", characterAvatar: "av1", thinking: "plot", },),
      baseScene({ messageId: "m2", },),
    ], 0,);

    await renderCurrentScene(false, spyNavigator().nav,);

    const sceneEl = container.querySelector(".vn-scene",)!;
    expect(sceneEl.className,).toBe("vn-scene vn-layout-split",);

    const bg = sceneEl.querySelector(".vn-background",)!;
    expect(bg.style.backgroundImage,).toBe("url(bg.png)",);
    expect(bg.style.backgroundSize,).toBe("cover",);

    const portrait = sceneEl.querySelector(".vn-portrait",)!;
    expect(portrait.className,).toContain("vn-portrait-left",);
    expect(portrait.querySelector(".vn-portrait-name",)!.textContent,).toBe("Mira",);
    expect(portrait.querySelector(".vn-portrait-img",)!.src,).toBe("/api/assets/av1/thumb",);

    expect(sceneEl.querySelector(".vn-speaker",)!.textContent,).toBe("Mira",);
    expect(sceneEl.querySelector(".vn-text",)!.textContent,).toBe("Well met.",);
    const thinking = sceneEl.querySelector(".vn-thinking",)!;
    expect(thinking.children[0]!.textContent,).toBe("Thinking...",);
    expect(thinking.children[1]!.textContent,).toBe("plot",);
    expect(sceneEl.querySelector(".vn-advance",)!.textContent,).toBe("▼",);

    expect(sceneEl.querySelector(".vn-prev",)!.disabled,).toBe(true,);
    expect(sceneEl.querySelector(".vn-next",)!.disabled,).toBe(false,);
    expect(sceneEl.querySelector(".vn-counter",)!.textContent,).toBe("1 / 2",);
  });

  test("overlay layout omits the portrait; narration speaks as Narrator", async () => {
    const container = install([baseScene({ role: "narration", },),], 0,);
    state.settings = { ...SETTINGS, layout: "overlay", };

    await renderCurrentScene(false, spyNavigator().nav,);

    const sceneEl = container.querySelector(".vn-scene",)!;
    expect(sceneEl.className,).toBe("vn-scene vn-layout-overlay",);
    expect(sceneEl.querySelector(".vn-portrait",),).toBeNull();
    expect(sceneEl.querySelector(".vn-speaker",)!.textContent,).toBe("Narrator",);
  });

  test("nav buttons reflect the boundaries of the scene list", async () => {
    const container = install([baseScene({},), baseScene({ messageId: "m2", },),], 1,);

    await renderCurrentScene(false, spyNavigator().nav,);

    const sceneEl = container.querySelector(".vn-scene",)!;
    expect(sceneEl.querySelector(".vn-prev",)!.disabled,).toBe(false,);
    expect(sceneEl.querySelector(".vn-next",)!.disabled,).toBe(true,);
    expect(sceneEl.querySelector(".vn-counter",)!.textContent,).toBe("2 / 2",);
  });

  test("choices container only renders inside a chat", async () => {
    const inChat = install([baseScene({},),], 0, { chatId: "chat-1", },);
    await renderCurrentScene(false, spyNavigator().nav,);
    expect(inChat.querySelector(".vn-choices-container",),).not.toBeNull();

    const standalone = install([baseScene({},),], 0,);
    await renderCurrentScene(false, spyNavigator().nav,);
    expect(standalone.querySelector(".vn-choices-container",),).toBeNull();
  });

  test("attachments render thumbs and captions; none when absent", async () => {
    const withFiles = install([baseScene({
      attachments: [
        makeAttachment("a1", "Map", { thumbUrl: "thumbs/a1.png", filename: "map.png", },),
        makeAttachment("a2", "", {
          filename: "notes.txt",
          mimeType: "text/plain",
          type: "file",
          width: 0,
          height: 0,
        },),
      ],
    },),], 0,);
    await renderCurrentScene(false, spyNavigator().nav,);
    const items = withFiles.querySelector(".vn-attachments-grid",)!.children;
    expect(items,).toHaveLength(2,);
    expect(items[0]!.querySelector(".vn-attachment-thumb",)!.src,).toBe("thumbs/a1.png",);
    expect(items[0]!.querySelector(".vn-attachment-caption",)!.textContent,).toBe("Map",);
    expect(items[1]!.querySelector(".vn-attachment-thumb",)!.src,).toBe("/api/assets/a2/thumb",);
    expect(items[1]!.querySelector(".vn-attachment-caption",)!.textContent,).toBe("notes.txt",);

    const bare = install([baseScene({},),], 0,);
    await renderCurrentScene(false, spyNavigator().nav,);
    expect(bare.querySelector(".vn-attachments",),).toBeNull();
  });

  test("repeated renders replace the container content", async () => {
    const container = install([baseScene({},), baseScene({ messageId: "m2", text: "Second.", },),], 0,);
    await renderCurrentScene(false, spyNavigator().nav,);
    state.currentIndex = 1;
    await renderCurrentScene(false, spyNavigator().nav,);

    const sceneEls = container.children.filter((c,) => c.className.startsWith("vn-scene",));
    expect(sceneEls,).toHaveLength(1,);
    expect(sceneEls[0]!.querySelector(".vn-text",)!.textContent,).toBe("Second.",);
  });
});

// ── Guards & clicks ─────────────────────────────────────────────────────────

describe("renderCurrentScene guards and interaction", () => {
  test("without container or settings it resolves and renders nothing", async () => {
    state.container = null;
    state.settings = { ...SETTINGS, };
    state.scenes = [baseScene({},),];
    await renderCurrentScene(false, spyNavigator().nav,);

    const container = makeEl();
    state.container = container as unknown as HTMLElement;
    state.settings = null;
    await renderCurrentScene(false, spyNavigator().nav,);
    expect(container.children,).toHaveLength(0,);
  });

  test("with typewriter off a click advances to the next scene", async () => {
    const container = install([baseScene({},), baseScene({ messageId: "m2", },),], 0,);
    const { nav, next, prev, } = spyNavigator();
    await renderCurrentScene(false, nav,);

    container.querySelector(".vn-scene",)!.dispatch("click",);
    expect(next,).toHaveLength(1,);
    expect(prev,).toHaveLength(0,);
  });

  test("with the typewriter running a click skips instead of advancing", async () => {
    const container = install([baseScene({},),], 0, { typewriter: true, },);
    const { nav, next, } = spyNavigator();
    const pending = renderCurrentScene(false, nav,);
    const textEl = container.querySelector(".vn-text",)!;
    expect(textEl.textContent,).toBe("W",);

    container.querySelector(".vn-scene",)!.dispatch("click",);
    await pending;
    expect(textEl.textContent,).toBe("Well met.",);
    expect(next,).toHaveLength(0,);
  });

  test("typewriter-enabled render resolves with the full text revealed", async () => {
    const container = install([baseScene({},),], 0, { typewriter: true, },);
    await renderCurrentScene(false, spyNavigator().nav,);
    expect(container.querySelector(".vn-text",)!.textContent,).toBe("Well met.",);
  });

  test("animated render delegates to the transition engine on the old scene", async () => {
    dom.reducedMotion.value = true;
    const container = install([baseScene({},), baseScene({ messageId: "m2", },),], 0,);
    await renderCurrentScene(false, spyNavigator().nav,);
    const outgoing = container.querySelector(".vn-scene",)!;
    expect(outgoing.style.display,).toBeUndefined();

    state.currentIndex = 1;
    await renderCurrentScene(true, spyNavigator().nav,);
    expect(outgoing.style.display,).toBe("none",);
  });
});
