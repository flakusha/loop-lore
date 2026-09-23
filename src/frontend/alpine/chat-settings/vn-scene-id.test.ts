// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { SCENE_ID_ATTR, } from "../../scene/view-mode";
import { syncSceneId, } from "./vn";

/** Minimal stand-in for the #vn-container element. */
class FakeContainer {
  readonly attrs = new Map<string, string>();

  getAttribute(name: string,): string | null {
    return this.attrs.get(name,) ?? null;
  }

  setAttribute(name: string, value: string,): void {
    this.attrs.set(name, value,);
  }

  removeAttribute(name: string,): void {
    this.attrs.delete(name,);
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
