// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { SCENE_ID_ATTR, } from "../../scene/view-mode";
import type { VnMessage, } from "../../vn";
import type { Message, } from "../types";
import { syncSceneId, syncVnRenderer, type VnRendererBridge, } from "./vn";

/** Minimal stand-in for the #vn-container element. */
class FakeContainer {
  readonly attrs = new Map<string, string>();
  cleared = 0;

  getAttribute(name: string,): string | null {
    return this.attrs.get(name,) ?? null;
  }

  setAttribute(name: string, value: string,): void {
    this.attrs.set(name, value,);
  }

  removeAttribute(name: string,): void {
    this.attrs.delete(name,);
  }

  replaceChildren(): void {
    this.cleared++;
  }
}

describe("syncSceneId", () => {
  test("mirrors the chat id onto the container", () => {
    const container = new FakeContainer();
    syncSceneId(container as unknown as HTMLElement, "chat-42",);
    expect(container.getAttribute(SCENE_ID_ATTR,),).toBe("chat-42",);
  });

  test("updates the id when the scene changes", () => {
    const container = new FakeContainer();
    const el = container as unknown as HTMLElement;
    syncSceneId(el, "chat-1",);
    syncSceneId(el, "chat-2",);
    expect(container.getAttribute(SCENE_ID_ATTR,),).toBe("chat-2",);
  });

  test("clears the attribute on teardown (no chat id)", () => {
    const container = new FakeContainer();
    const el = container as unknown as HTMLElement;
    syncSceneId(el, "chat-1",);
    syncSceneId(el, undefined,);
    expect(container.getAttribute(SCENE_ID_ATTR,),).toBeNull();
  });

  test("no-ops without a container", () => {
    expect(() => syncSceneId(null, "chat-1",)).not.toThrow();
  });
});

/** Message fixture with only the fields toVnMessage reads. */
const msg = (id: string,): Message => ({
  id,
  role: "assistant",
  content: "hello scene",
  created_at: "2024-01-01T00:00:00Z",
} as Message);

/** Recording renderer bridge — counts init/destroy, captures init args. */
function recordingBridge(): {
  bridge: VnRendererBridge;
  inits: Array<{ chatId: string | undefined; messages: VnMessage[] }>;
  destroys: () => number;
} {
  const state = { inits: [] as Array<{ chatId: string | undefined; messages: VnMessage[] }>, destroyCount: 0, };
  return {
    inits: state.inits,
    destroys: () => state.destroyCount,
    bridge: {
      init: (
        _container: HTMLElement,
        messages: VnMessage[],
        _config: Record<string, unknown>,
        chatId: string | undefined,
      ): void => {
        state.inits.push({ chatId, messages, },);
      },
      destroy: (): void => {
        state.destroyCount++;
      },
    },
  };
}

/** Swap the setup-stub document.querySelector to return one fake container. */
function withContainer(run: (container: FakeContainer,) => void,): void {
  const g = globalThis as Omit<typeof globalThis, "document"> & {
    document: { querySelector: unknown };
  };
  const prev = g.document.querySelector;
  const container = new FakeContainer();
  g.document.querySelector = () => container as unknown as HTMLElement;
  try {
    run(container,);
  } finally {
    g.document.querySelector = prev;
  }
}

describe("syncVnRenderer scene-id wiring", () => {
  test("disabled renderer destroys and clears the scene id", () => {
    withContainer((container,) => {
      const { bridge, inits, destroys, } = recordingBridge();
      container.attrs.set(SCENE_ID_ATTR, "chat-1",);

      syncVnRenderer([msg("m1",),], null, false, "chat-1", bridge,);

      expect(destroys(),).toBe(1,);
      expect(inits,).toHaveLength(0,);
      expect(container.getAttribute(SCENE_ID_ATTR,),).toBeNull();
      expect(container.cleared,).toBe(1,);
    },);
  });

  test("renderingOverride visual_novel enables without vnEnabled", () => {
    withContainer((container,) => {
      const { bridge, inits, destroys, } = recordingBridge();
      const gmConfig = JSON.stringify({ renderingOverride: "visual_novel", },);

      syncVnRenderer([msg("m1",),], gmConfig, false, "chat-7", bridge,);

      expect(destroys(),).toBe(0,);
      expect(inits,).toHaveLength(1,);
      expect(inits[0]?.chatId,).toBe("chat-7",);
      expect(inits[0]?.messages,).toHaveLength(1,);
      expect(container.getAttribute(SCENE_ID_ATTR,),).toBe("chat-7",);
    },);
  });

  test("renderingOverride text disables despite vnEnabled", () => {
    withContainer((container,) => {
      const { bridge, inits, destroys, } = recordingBridge();
      const gmConfig = JSON.stringify({ renderingOverride: "text", },);

      syncVnRenderer([msg("m1",),], gmConfig, true, "chat-7", bridge,);

      expect(destroys(),).toBe(1,);
      expect(inits,).toHaveLength(0,);
      expect(container.getAttribute(SCENE_ID_ATTR,),).toBeNull();
    },);
  });

  test("enabled with zero messages destroys without touching the scene id", () => {
    withContainer((container,) => {
      const { bridge, inits, destroys, } = recordingBridge();

      syncVnRenderer([], null, true, "chat-7", bridge,);

      expect(destroys(),).toBe(1,);
      expect(inits,).toHaveLength(0,);
      expect(container.attrs.size,).toBe(0,);
    },);
  });
});
