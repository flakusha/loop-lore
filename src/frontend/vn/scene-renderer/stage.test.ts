// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for multi-sprite VN staging: group scenes render the shared stage
 * (ordered slots + active-speaker highlight) instead of the single portrait,
 * while solo scenes keep the legacy portrait path.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { type FakeDom, type FakeEl, installVnFakeDom, makeEl, } from "../../tests/vn-fake-dom";
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
  state.roster = null;
},);

afterEach(() => {
  dom.restore();
},);

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

function castMember(id: string, name: string,): { characterId: string; name: string; avatarAssetId: string } {
  return { characterId: id, name, avatarAssetId: `av-${id}`, };
}

function groupScene(overrides: Partial<VnScene> = {},): VnScene {
  return {
    messageId: "g1",
    characterName: "Rin",
    text: "Together.",
    role: "assistant",
    cast: [castMember("rin", "Rin",), castMember("kai", "Kai",),],
    speakerId: "rin",
    ...overrides,
  };
}

function install(scenes: VnScene[], index: number, layout: "split" | "overlay" | "below" = "split",): FakeEl {
  const container = makeEl();
  state.container = container as unknown as HTMLElement;
  state.settings = { ...SETTINGS, layout, };
  state.scenes = scenes;
  state.currentIndex = index;
  state.currentChatId = null;
  return container;
}

/** All descendants carrying a class (stage sprites reuse vn-portrait). */
function allByClass(root: FakeEl, cls: string,): FakeEl[] {
  const out: FakeEl[] = [];
  const walk = (el: FakeEl,): void => {
    for (const child of el.children) {
      if (child.className.split(" ",).includes(cls,)) { out.push(child,); }
      walk(child,);
    }
  };
  walk(root,);
  return out;
}

function spritesOf(container: FakeEl,): FakeEl[] {
  return container.querySelector(".vn-stage",)?.children ?? [];
}

const NAV: SceneNavigator = { next: () => undefined, prev: () => undefined, };

describe("group scene staging", () => {
  test("two-speaker scene renders the stage, not the single portrait", async () => {
    const container = install([groupScene(),], 0,);

    await renderCurrentScene(false, NAV,);

    const sceneEl = container.querySelector(".vn-scene",)!;
    const portraits = allByClass(sceneEl, "vn-portrait",);
    expect(portraits,).toHaveLength(2,);
    for (const portrait of portraits) {
      expect(portrait.className,).toContain("vn-stage-sprite",);
    }
    const stage = sceneEl.querySelector(".vn-stage",)!;
    expect(stage,).not.toBeNull();
    expect(spritesOf(sceneEl,),).toHaveLength(2,);
  });

  test("speaker highlights while the other sprite dims", async () => {
    const container = install([groupScene(),], 0,);

    await renderCurrentScene(false, NAV,);

    const [rin, kai,] = spritesOf(container.querySelector(".vn-scene",)!,);
    expect(rin?.classList.contains("vn-speaker-active",),).toBe(true,);
    expect(rin?.classList.contains("vn-speaker-dimmed",),).toBe(false,);
    expect(rin?.className,).toContain("vn-slot-left",);
    expect(kai?.classList.contains("vn-speaker-active",),).toBe(false,);
    expect(kai?.classList.contains("vn-speaker-dimmed",),).toBe(true,);
    expect(kai?.className,).toContain("vn-slot-right",);
  });

  test("narration dims the whole stage", async () => {
    const container = install([groupScene({ role: "narration", speakerId: null, },),], 0,);

    await renderCurrentScene(false, NAV,);

    const sprites = spritesOf(container.querySelector(".vn-scene",)!,);
    expect(sprites,).toHaveLength(2,);
    for (const sprite of sprites) {
      expect(sprite.classList.contains("vn-speaker-active",),).toBe(false,);
      expect(sprite.classList.contains("vn-speaker-dimmed",),).toBe(true,);
    }
  });

  test("hidden cast members leave the stage", async () => {
    const scene = groupScene();
    scene.cast = [
      castMember("rin", "Rin",),
      { ...castMember("kai", "Kai",), visible: false, },
    ];
    const container = install([scene,], 0,);

    await renderCurrentScene(false, NAV,);

    expect(spritesOf(container.querySelector(".vn-scene",)!,),).toHaveLength(1,);
  });

  test("overlay layout omits both stage and portrait", async () => {
    const container = install([groupScene(),], 0, "overlay",);

    await renderCurrentScene(false, NAV,);

    const sceneEl = container.querySelector(".vn-scene",)!;
    expect(sceneEl.querySelector(".vn-stage",),).toBeNull();
    expect(sceneEl.querySelector(".vn-portrait",),).toBeNull();
  });
});

describe("solo scene compatibility", () => {
  test("single-speaker scene keeps the legacy portrait path", async () => {
    const container = install([{
      messageId: "s1",
      characterName: "Mira",
      characterAvatar: "av1",
      text: "Solo.",
      role: "assistant",
      cast: [{ characterId: "mira", name: "Mira", avatarAssetId: "av1", },],
      speakerId: "mira",
    },], 0,);

    await renderCurrentScene(false, NAV,);

    const sceneEl = container.querySelector(".vn-scene",)!;
    expect(sceneEl.querySelector(".vn-stage",),).toBeNull();
    expect(sceneEl.querySelector(".vn-portrait",),).not.toBeNull();
  });
});
