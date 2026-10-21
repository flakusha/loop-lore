// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for frontend/vn/scene-renderer/dom-elements.ts — the DOM builders.
 *
 * These are pure builders (scene + resolved settings -> element, touching no
 * renderer state except the nav's boundary flags), so they are exercised
 * directly here rather than through renderCurrentScene's mount. The
 * render-scene suite still owns the end-to-end shape; this file pins each
 * builder's own contract: element type, classes, attributes, text and the
 * unsafe-input fallbacks.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { type FakeDom, installVnFakeDom, } from "../../tests/vn-fake-dom";
import {
  createAttachments,
  createBackground,
  createDialogue,
  createNav,
  createPortrait,
} from "./dom-elements";
import { state, } from "./state";

const SCALING = { imageScaling: "auto", } as const;
const SPLIT = { layout: "split", portraitSize: 35, } as const;
const DIALOGUE = { layout: "split", dialogueBoxOpacity: 0.75, } as const;

let dom: FakeDom;

beforeEach(() => {
  dom = installVnFakeDom();
  state.scenes = [];
  state.currentIndex = 0;
},);

afterEach(() => {
  dom.restore();
},);

describe("createBackground", () => {
  test("mounts a background div sized to the requested scaling", () => {
    const bg = createBackground({ backgroundUrl: "bg.png", }, SCALING,);

    expect(bg.tagName,).toBe("DIV",);
    expect(bg.className,).toBe("vn-background",);
    expect(bg.style.backgroundImage,).toBe('url("bg.png")',);
    expect(bg.style.backgroundSize,).toBe("cover",);
  });

  test("passes a non-auto scaling through verbatim", () => {
    const bg = createBackground({ backgroundUrl: "bg.png", }, { imageScaling: "contain", },);

    expect(bg.style.backgroundSize,).toBe("contain",);
  });

  test("an absent url still produces an empty quoted token", () => {
    expect(createBackground({}, SCALING,).style.backgroundImage,).toBe('url("")',);
  });

  test("percent-encodes the url so it cannot be reinterpreted as CSS", () => {
    const bg = createBackground({ backgroundUrl: "a b.png", }, SCALING,);

    expect(bg.style.backgroundImage,).toBe('url("a%20b.png")',);
  });

  test("a url()-token terminator is dropped instead of truncated", () => {
    const bg = createBackground({ backgroundUrl: "bg.png);evil", }, SCALING,);

    expect(bg.style.backgroundImage,).toBe('url("")',);
  });
});

describe("createPortrait", () => {
  test("omits the portrait entirely in overlay layout", () => {
    expect(createPortrait({ role: "assistant", characterName: "Mira", }, { layout: "overlay", portraitSize: 35, },),)
      .toBeNull();
  });

  test("positions the sprite by role and carries the name and avatar", () => {
    const portrait = createPortrait({
      role: "assistant",
      characterName: "Mira",
      characterAvatar: "av1",
    }, SPLIT,)!;

    expect(portrait.tagName,).toBe("DIV",);
    expect(portrait.className,).toBe("vn-portrait vn-portrait-left",);
    expect(portrait.style.width,).toBe("35%",);
    expect(portrait.querySelector(".vn-portrait-name",)!.textContent,).toBe("Mira",);
    const img = portrait.querySelector(".vn-portrait-img",) as HTMLImageElement;
    expect(img.src,).toBe("/api/v1/assets/av1/thumb",);
    expect(img.alt,).toBe("Mira",);
  });

  test("the user role takes the right slot", () => {
    expect(
      createPortrait({ role: "user", characterName: "You", }, SPLIT,)!.className,
    ).toBe("vn-portrait vn-portrait-right",);
  });

  test("no avatar means no image, only the name", () => {
    const portrait = createPortrait({ role: "assistant", characterName: "Mira", }, SPLIT,)!;

    expect(portrait.querySelector(".vn-portrait-img",),).toBeNull();
    expect(portrait.querySelector(".vn-portrait-name",)!.textContent,).toBe("Mira",);
  });
});

describe("createDialogue", () => {
  test("narrations speak as Narrator; characters keep their name", () => {
    const textEl = document.createElement("div",);
    const narration = createDialogue({ role: "narration", characterName: "Mira", }, DIALOGUE, textEl,);
    expect(narration.querySelector(".vn-speaker",)!.textContent,).toBe("Narrator",);
    expect(narration.querySelector(".vn-advance",)!.textContent,).toBe("▼",);

    const spoken = createDialogue({ role: "assistant", characterName: "Mira", }, DIALOGUE, textEl,);
    expect(spoken.querySelector(".vn-speaker",)!.textContent,).toBe("Mira",);
  });

  test("appends the caller's text node rather than replacing it", () => {
    const textEl = document.createElement("div",);
    textEl.className = "vn-text";
    textEl.textContent = "Well met.";

    const box = createDialogue({ role: "assistant", characterName: "Mira", }, DIALOGUE, textEl,);

    expect(box.querySelector(".vn-text",)!.textContent,).toBe("Well met.",);
    expect(box.children,).toHaveLength(3,); // speaker, caller's text node, advance marker
  });

  test("thinking becomes a collapsed details block; none when absent", () => {
    const textEl = document.createElement("div",);
    const thinking = createDialogue(
      {
        role: "assistant",
        characterName: "Mira",
        thinking: "plot",
      },
      DIALOGUE,
      textEl,
    );

    const details = thinking.querySelector(".vn-thinking",)!;
    expect(details.children[0]!.textContent,).toBe("Thinking...",);
    expect(details.children[1]!.textContent,).toBe("plot",);

    const plain = createDialogue({ role: "assistant", characterName: "Mira", }, DIALOGUE, textEl,);
    expect(plain.querySelector(".vn-thinking",),).toBeNull();
  });

  test("overlay layout carries the dialogue box opacity", () => {
    const textEl = document.createElement("div",);
    const box = createDialogue(
      { role: "assistant", characterName: "Mira", },
      { layout: "overlay", dialogueBoxOpacity: 0.4, },
      textEl,
    );

    expect(box.className,).toBe("vn-dialogue-box",);
    expect(box.style.opacity,).toBe("0.4",);
    const split = createDialogue({ role: "assistant", characterName: "Mira", }, DIALOGUE, textEl,);

    // Untouched: the fake element only records assigned properties.
    expect(split.style.opacity,).toBeUndefined();
  });
});

describe("createNav", () => {
  test("disables prev at the first scene and reports the 1-based counter", () => {
    state.scenes = [{ messageId: "m1", characterName: "Mira", text: "hi", role: "assistant", }, {
      messageId: "m2",
      characterName: "Mira",
      text: "hi",
      role: "assistant",
    },];

    state.currentIndex = 0;

    const nav = createNav({ next: () => {}, prev: () => {}, },);

    expect(nav.tagName,).toBe("DIV",);
    expect(nav.className,).toBe("vn-nav",);
    const prev = nav.querySelector(".vn-prev",) as HTMLButtonElement;
    const next = nav.querySelector(".vn-next",) as HTMLButtonElement;
    expect(prev.textContent,).toBe("←",);
    expect(next.textContent,).toBe("→",);
    expect(prev.disabled,).toBe(true,);
    expect(next.disabled,).toBe(false,);
    expect(nav.querySelector(".vn-counter",)!.textContent,).toBe("1 / 2",);
  });

  test("disables next at the last scene", () => {
    state.scenes = [{ messageId: "m1", characterName: "Mira", text: "hi", role: "assistant", }, {
      messageId: "m2",
      characterName: "Mira",
      text: "hi",
      role: "assistant",
    },];

    state.currentIndex = 1;

    const nav = createNav({ next: () => {}, prev: () => {}, },);

    expect((nav.querySelector(".vn-prev",) as HTMLButtonElement).disabled,).toBe(false,);
    expect((nav.querySelector(".vn-next",) as HTMLButtonElement).disabled,).toBe(true,);
    expect(nav.querySelector(".vn-counter",)!.textContent,).toBe("2 / 2",);
  });

  test("wires the injected callbacks to the buttons", () => {
    const calls: string[] = [];
    const nav = createNav({ next: () => calls.push("next",), prev: () => calls.push("prev",), },);

    (nav.querySelector(".vn-prev",) as unknown as { dispatch(e: string,): void }).dispatch("click",);
    (nav.querySelector(".vn-next",) as unknown as { dispatch(e: string,): void }).dispatch("click",);
    expect(calls,).toEqual(["prev", "next",],);
  });
});

describe("createAttachments", () => {
  test("returns null without attachments", () => {
    expect(createAttachments({},),).toBeNull();
    expect(createAttachments({ attachments: [], },),).toBeNull();
  });

  test("renders one item per attachment with its thumb, caption and alt", () => {
    const grid = createAttachments({
      attachments: [
        { assetId: "a1", thumbUrl: "thumbs/a1.png", caption: "Map", filename: "map.png", },
        { assetId: "a 2", filename: "notes.txt", },
      ],
    },)!;

    expect(grid.className,).toBe("vn-attachments",);
    expect(grid.querySelector(".vn-attachments-title",)!.textContent,).toBe("Attachments",);
    const items = grid.querySelector(".vn-attachments-grid",)!.children;
    expect(items,).toHaveLength(2,);

    const first = items[0]!;
    expect((first.querySelector(".vn-attachment-thumb",) as HTMLImageElement).src,).toBe("thumbs/a1.png",);
    expect(first.querySelector(".vn-attachment-caption",)!.textContent,).toBe("Map",);

    const second = items[1]!;
    expect((second.querySelector(".vn-attachment-thumb",) as HTMLImageElement).src,).toBe(
      "/api/v1/assets/a%202/thumb",
    );

    expect(second.querySelector(".vn-attachment-caption",)!.textContent,).toBe("notes.txt",);
  });

  test("the caption falls back to the filename, then a neutral alt", () => {
    const withFilename = createAttachments({ attachments: [{ assetId: "a1", filename: "notes.txt", },], },)!;
    expect((withFilename.querySelector(".vn-attachment-thumb",) as HTMLImageElement).alt,).toBe("notes.txt",);

    const bare = createAttachments({ attachments: [{ assetId: "a1", },], },)!;
    expect((bare.querySelector(".vn-attachment-thumb",) as HTMLImageElement).alt,).toBe("Attachment",);
    expect(bare.querySelector(".vn-attachment-caption",),).toBeNull();
  });
});
