// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the face-anchor preview editor: point normalization, prefill
 * placement, click-to-save roundtrip, and teardown.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { mountAnchorEditor, normalizePoint, } from "./asset-anchor";
import { type FakeDom, installVnFakeDom, makeEl, } from "./tests/vn-fake-dom";

let dom: FakeDom;
beforeEach(() => {
  dom = installVnFakeDom();
},);
afterEach(() => {
  dom.restore();
},);

describe("normalizePoint", () => {
  test("maps offsets to 0..1", () => {
    expect(normalizePoint(200, 100, 80, 30,),).toEqual({ x: 0.4, y: 0.3, },);
  });
  test("clamps out-of-range offsets", () => {
    expect(normalizePoint(200, 100, 400, -10,),).toEqual({ x: 1, y: 0, },);
  });
  test("zero size falls back to center", () => {
    expect(normalizePoint(0, 0, 5, 5,),).toEqual({ x: 0.5, y: 0.5, },);
  });
});

describe("mountAnchorEditor", () => {
  test("prefills the marker from the loaded anchor", async () => {
    const container = makeEl("div",);
    const img = makeEl("img",);
    container.append(img,);
    mountAnchorEditor(img as unknown as HTMLImageElement, "a1", {
      load: async () => ({ x: 0.4, y: 0.3, }),
      save: async () => true,
      notify: () => {},
    },);
    await Promise.resolve();
    await Promise.resolve();
    const marker = container.querySelector(".asset-anchor-marker",);
    expect(marker?.style["left"],).toBe("40%",);
    expect(marker?.style["top"],).toBe("30%",);
  });
  test("click saves the normalized point", async () => {
    const container = makeEl("div",);
    const img = makeEl("img",);
    const saved: Array<{ x: number; y: number }> = [];
    img.getBoundingClientRect = () => {
      return { left: 10, top: 20, width: 200, height: 100, };
    };
    const notes: string[] = [];
    container.append(img,);
    mountAnchorEditor(img as unknown as HTMLImageElement, "a1", {
      load: async () => null,
      save: async (_id, point,) => {
        saved.push(point,);
        return true;
      },
      notify: (_kind, message,) => {
        notes.push(message,);
      },
    },);
    img.dispatch("click", { clientX: 110, clientY: 70, },);
    await Promise.resolve();
    await Promise.resolve();
    expect(saved,).toEqual([{ x: 0.5, y: 0.5, },],);
    expect(notes,).toEqual(["Anchor saved",],);
  });
  test("failed save notifies an error", async () => {
    const notes: string[] = [];
    const container = makeEl("div",);
    const img = makeEl("img",);
    img.getBoundingClientRect = () => {
      return { left: 10, top: 20, width: 200, height: 100, };
    };
    container.append(img,);
    mountAnchorEditor(img as unknown as HTMLImageElement, "a1", {
      load: async () => null,
      save: async () => false,
      notify: (_kind, message,) => {
        notes.push(message,);
      },
    },);
    img.dispatch("click", { clientX: 110, clientY: 70, },);
    await Promise.resolve();
    await Promise.resolve();
    expect(notes,).toEqual(["Failed to save anchor",],);
  });
  test("destroy removes the marker and detaches clicks", async () => {
    const saved: Array<{ x: number; y: number }> = [];
    const container = makeEl("div",);
    const img = makeEl("img",);
    container.append(img,);
    const destroy = mountAnchorEditor(img as unknown as HTMLImageElement, "a1", {
      load: async () => null,
      save: async (_id, point,) => {
        saved.push(point,);
        return true;
      },
      notify: () => {},
    },);
    expect(container.querySelectorAll(".asset-anchor-marker",).length,).toBe(1,);
    destroy();
    expect(container.querySelectorAll(".asset-anchor-marker",).length,).toBe(0,);
    img.dispatch("click", { clientX: 10, clientY: 10, },);
    await Promise.resolve();
    expect(saved,).toEqual([],);
  });
});
