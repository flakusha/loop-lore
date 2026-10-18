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
import type { VnCompositeStep, } from "../templates/template-engine";
import { renderCurrentScene, type SceneNavigator, } from "./render-scene";
import { state, } from "./state";
import type { VnScene, } from "./types";

let dom: FakeDom;
// bun:test has no DOM storage; the custom-template store needs a stub.
const testStorage = new Map<string, string>();
const originalStorage = (globalThis as { localStorage?: unknown }).localStorage;

beforeEach(() => {
  dom = installVnFakeDom();
  testStorage.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string,) => testStorage.get(key,) ?? null,
    setItem: (key: string, value: string,) => void testStorage.set(key, String(value,),),
    removeItem: (key: string,) => void testStorage.delete(key,),
  };

  state.scenes = [];
  state.currentIndex = 0;
  state.container = null;
  state.settings = null;
  state.currentChatId = null;
  state.currentWorldId = null;
  state.loadingIndicator = null;
},);

afterEach(() => {
  dom.restore();
  (globalThis as { localStorage?: unknown }).localStorage = originalStorage;
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
  vnChoicesEnabled: true,
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

function install(
  scenes: VnScene[],
  index: number,
  opts: { chatId?: string | null; typewriter?: boolean; vnChoicesEnabled?: boolean } = {},
): FakeEl {
  const container = makeEl();
  state.container = container as unknown as HTMLElement;
  state.settings = {
    ...SETTINGS,
    typewriter: opts.typewriter ?? false,
    vnChoicesEnabled: opts.vnChoicesEnabled ?? SETTINGS.vnChoicesEnabled,
  };

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
    expect(portrait.querySelector(".vn-portrait-img",)!.src,).toBe("/api/v1/assets/av1/thumb",);

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

  test("sanitizes backgroundUrl with ) to prevent CSS injection", async () => {
    const container = install([
      baseScene({ backgroundUrl: "bg.png);evil", },),
    ], 0,);

    await renderCurrentScene(false, spyNavigator().nav,);

    const bg = container.querySelector(".vn-background",)!;
    expect(bg.style.backgroundImage,).toBe("url()",);
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
    expect(items[1]!.querySelector(".vn-attachment-thumb",)!.src,).toBe("/api/v1/assets/a2/thumb",);
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

  test("removes every stale scene, including adjacent ones", async () => {
    // `children` is live: removing one element shifts every later index down.
    // Forward iteration therefore skips whichever scene follows the one it just
    // removed, so adjacent stale scenes survive the sweep. Seed them adjacent
    // so the skip leaves observable residue.
    const container = install([baseScene({},),], 0,);
    for (const label of ["stale-a", "stale-b", "stale-c",]) {
      const stale = makeEl();
      stale.className = "vn-scene";
      const text = makeEl();
      text.className = "vn-text";
      text.textContent = label;
      stale.append(text,);
      container.append(stale,);
    }

    await renderCurrentScene(false, spyNavigator().nav,);

    const sceneEls = container.children.filter((c,) => c.className.startsWith("vn-scene",));
    expect(sceneEls,).toHaveLength(1,);
    expect(sceneEls[0]!.querySelector(".vn-text",)!.textContent,).toBe("Well met.",);
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

  test("without scenes it resolves and renders nothing", async () => {
    const container = install([], 0,);
    await renderCurrentScene(false, spyNavigator().nav,);
    expect(container.children,).toHaveLength(0,);
  });

  test("a re-render keeps non-scene overlays such as the loading indicator", async () => {
    const container = install([baseScene({},),], 0,);
    const overlay = makeEl();
    overlay.className = "vn-loading-indicator";
    container.append(overlay,);

    await renderCurrentScene(false, spyNavigator().nav,);

    expect(container.querySelector(".vn-loading-indicator",),).not.toBeNull();
    expect(container.children.includes(overlay,),).toBe(true,);
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

  test("animated render wires the incoming scene and drops the old one", async () => {
    dom.reducedMotion.value = true;
    const container = install([baseScene({},), baseScene({ messageId: "m2", text: "Second.", },),], 0,);
    await renderCurrentScene(false, spyNavigator().nav,);
    const outgoing = container.querySelector(".vn-scene",)!;

    state.currentIndex = 1;
    await renderCurrentScene(true, spyNavigator().nav,);
    expect(outgoing.style.display,).toBe("none",);
    expect(container.children.includes(outgoing,),).toBe(false,);

    const sceneEls = container.children.filter((c,) => c.className.startsWith("vn-scene",));
    expect(sceneEls,).toHaveLength(1,);
    expect(sceneEls[0]!.querySelector(".vn-text",)!.textContent,).toBe("Second.",);
  });
});

// ── Per-chat choice opt-in ─────────────────────────────────────────────────

describe("renderCurrentScene choice opt-in", () => {
  let fetchCalls: string[];
  let realFetch: typeof globalThis.fetch;

  beforeEach(() => {
    fetchCalls = [];
    realFetch = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL,) => {
      fetchCalls.push(String(input,),);
      return Promise.resolve(new Response("{}", { status: 200, },),);
    }) as typeof globalThis.fetch;
  },);

  afterEach(() => {
    globalThis.fetch = realFetch;
  },);

  // Regression guard for the mount landed earlier: both containers must still
  // appear when the chat opts in.
  test("flag on mounts both the choices and questions containers", async () => {
    const container = install([baseScene({},),], 0, { chatId: "chat-1", vnChoicesEnabled: true, },);
    await renderCurrentScene(false, spyNavigator().nav,);

    expect(container.querySelector(".vn-choices-container",),).not.toBeNull();
    expect(container.querySelector(".vn-questions-container",),).not.toBeNull();
  });

  test("flag on issues the choice and question fetches", async () => {
    install([baseScene({},),], 0, { chatId: "chat-1", vnChoicesEnabled: true, },);
    await renderCurrentScene(false, spyNavigator().nav,);

    expect(fetchCalls.some((u,) => u.includes("/vn-choices",)),).toBe(true,);
    expect(fetchCalls.some((u,) => u.includes("/vn-questions",)),).toBe(true,);
  });

  test("flag off creates neither container", async () => {
    const container = install([baseScene({},),], 0, { chatId: "chat-1", vnChoicesEnabled: false, },);
    await renderCurrentScene(false, spyNavigator().nav,);

    expect(container.querySelector(".vn-choices-container",),).toBeNull();
    expect(container.querySelector(".vn-questions-container",),).toBeNull();
  });

  // Init-then-hide would satisfy the DOM assertions above while still firing
  // two GETs per scene render. Pin the network behaviour, not just the shape.
  test("flag off issues no choice or question fetch", async () => {
    install([baseScene({},),], 0, { chatId: "chat-1", vnChoicesEnabled: false, },);
    await renderCurrentScene(false, spyNavigator().nav,);

    expect(fetchCalls.filter((u,) => u.includes("/vn-choices",) || u.includes("/vn-questions",)),).toHaveLength(0,);
  });

  test("flag off still renders the scene itself", async () => {
    const container = install([baseScene({},),], 0, { chatId: "chat-1", vnChoicesEnabled: false, },);
    await renderCurrentScene(false, spyNavigator().nav,);

    expect(container.querySelector(".vn-scene",)!.querySelector(".vn-text",)!.textContent,).toBe("Well met.",);
  });

  // A chat with no id never mounted cards in the first place; the added
  // predicate must not change that.
  test("no chat id mounts nothing regardless of the flag", async () => {
    const container = install([baseScene({},),], 0, { chatId: null, vnChoicesEnabled: true, },);
    await renderCurrentScene(false, spyNavigator().nav,);

    expect(container.querySelector(".vn-choices-container",),).toBeNull();
    expect(container.querySelector(".vn-questions-container",),).toBeNull();
  });
});

// ── Composite template orchestration ────────────────────────────────────────

describe("renderCurrentScene composite templates", () => {
  const WORLD = "render-composite-world";

  /** Seed a custom composite template for WORLD and scope the renderer to it. */
  function installComposite(
    steps: VnCompositeStep[],
    scenes: VnScene[],
    index = 0,
  ): FakeEl {
    localStorage.setItem(
      `vn-templates-${WORLD}`,
      JSON.stringify([{
        id: "combo",
        name: "Combo",
        description: "",
        worldId: WORLD,
        category: "composite",
        version: 1,
        variables: [],
        body: { layout: "inherit", transition: "inherit", steps, },
        tags: [],
        createdAt: "2024-01-01T00:00:00Z",
        modifiedAt: "2024-01-01T00:00:00Z",
      },],),
    );

    const container = install(scenes, index,);
    state.currentWorldId = WORLD;

    return container;
  }

  afterEach(() => {
    localStorage.removeItem(`vn-templates-${WORLD}`,);
  },);

  test("folds each applied step's overrides; later steps win", async () => {
    // quiet_moment ships layout below, confrontation ships layout split; the
    // fold order decides the mounted layout class.
    const container = installComposite([
      { templateId: "confrontation", },
      { templateId: "quiet_moment", },
    ], [baseScene({ templateId: "combo", },),],);

    await renderCurrentScene(false, spyNavigator().nav,);

    const sceneEl = container.querySelector(".vn-scene",)!;
    expect(sceneEl.className,).toBe("vn-scene vn-layout-below",);
  });

  test("false conditions skip their step without aborting the rest", async () => {
    const container = installComposite([
      { templateId: "quiet_moment", condition: "mood == 'calm'", },
      { templateId: "confrontation", },
    ], [baseScene({ templateId: "combo", templateVars: { mood: "tense", }, },),],);

    await renderCurrentScene(false, spyNavigator().nav,);

    // confrontation ships layout overlay; the skipped quiet_moment (below)
    // did not override it afterwards.
    expect(container.querySelector(".vn-scene",)!.className,).toBe("vn-scene vn-layout-overlay",);
  });

  test("unknown step ids are skipped; the scene still renders on base settings", async () => {
    const container = installComposite([
      { templateId: "no-such-template", },
    ], [baseScene({ templateId: "combo", },),],);

    await renderCurrentScene(false, spyNavigator().nav,);

    // Base SETTINGS layout is split, nothing applied.
    expect(container.querySelector(".vn-scene",)!.className,).toBe("vn-scene vn-layout-split",);
    expect(container.querySelector(".vn-text",)!.textContent,).toBe("Well met.",);
  });

  test("awaits step delays before mounting", async () => {
    const container = installComposite([
      { templateId: "quiet_moment", delay: 20, },
    ], [baseScene({ templateId: "combo", },),],);

    const pending = renderCurrentScene(false, spyNavigator().nav,);
    // Still inside the 20ms step delay: nothing mounted yet.
    expect(container.querySelector(".vn-scene",),).toBeNull();

    await pending;
    expect(container.querySelector(".vn-scene",)!.className,).toBe("vn-scene vn-layout-below",);
  });

  test("a newer render cancels a delayed composite run's mount", async () => {
    const container = installComposite(
      [{ templateId: "quiet_moment", delay: 60, },],
      [
        baseScene({ messageId: "slow", templateId: "combo", },),
        baseScene({ messageId: "fast", text: "Second.", },),
      ],
    );

    const slowRun = renderCurrentScene(false, spyNavigator().nav,);
    state.currentIndex = 1;
    await renderCurrentScene(false, spyNavigator().nav,);
    await slowRun;

    const sceneEls = container.children.filter((c,) => c.className.startsWith("vn-scene",));
    expect(sceneEls,).toHaveLength(1,);
    expect(sceneEls[0]!.querySelector(".vn-text",)!.textContent,).toBe("Second.",);
  });

  test("a scene template outside the custom store renders with base settings", async () => {
    // Without the world scoped to the store, the composite id is unknown and
    // the non-composite path applies built-in resolution only.
    const container = install([baseScene({ templateId: "combo", },),], 0,);
    await renderCurrentScene(false, spyNavigator().nav,);

    expect(container.querySelector(".vn-scene",)!.className,).toBe("vn-scene vn-layout-split",);
  });
});
