// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the VN sprite face-anchor pass: row → anchor extraction,
 * CSS mapping, memoized loading, and best-effort stage decoration.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { type FakeDom, installVnFakeDom, makeEl, } from "../tests/vn-fake-dom";
import {
  anchorFromTransform,
  anchorToObjectPosition,
  applySpriteAnchor,
  createAnchorLoader,
  decorateStageAnchors,
  isAssetIdRef,
  type SpriteAnchor,
} from "./sprite-anchor";

let dom: FakeDom;
beforeEach(() => {
  dom = installVnFakeDom();
},);
afterEach(() => {
  dom.restore();
},);

function imgEl(): HTMLImageElement {
  return makeEl("img",) as unknown as HTMLImageElement;
}

describe("anchorFromTransform", () => {
  test("extracts focal point from a resolved row", () => {
    expect(anchorFromTransform({ focal_point_x: 0.4, focal_point_y: 0.3, },),).toEqual({ x: 0.4, y: 0.3, },);
  });
  test("null for missing rows and incomplete focal data", () => {
    expect(anchorFromTransform(null,),).toBeNull();
    expect(anchorFromTransform(undefined,),).toBeNull();
    expect(anchorFromTransform({},),).toBeNull();
    expect(anchorFromTransform({ focal_point_x: 0.4, focal_point_y: null, },),).toBeNull();
  });
  test("null for non-finite focal values", () => {
    expect(anchorFromTransform({ focal_point_x: NaN, focal_point_y: 0.3, },),).toBeNull();
    expect(anchorFromTransform({ focal_point_x: 0.4, focal_point_y: Infinity, },),).toBeNull();
  });
});

describe("anchorToObjectPosition", () => {
  test("maps normalized focal to CSS percentages", () => {
    expect(anchorToObjectPosition({ x: 0.4, y: 0.3, },),).toBe("40% 30%",);
    expect(anchorToObjectPosition({ x: 0.5, y: 0.35, },),).toBe("50% 35%",);
  });
  test("clamps out-of-range anchors to valid CSS", () => {
    expect(anchorToObjectPosition({ x: 2, y: -0.5, },),).toBe("100% 0%",);
  });
});

describe("applySpriteAnchor", () => {
  test("sets object-position, clears on null", () => {
    const img = imgEl();
    applySpriteAnchor(img, { x: 0.4, y: 0.3, },);
    expect(img.style.objectPosition,).toBe("40% 30%",);
    applySpriteAnchor(img, null,);
    expect(img.style.objectPosition,).toBe("",);
  });
});

describe("isAssetIdRef", () => {
  test("accepts plain ids, rejects URLs and empties", () => {
    expect(isAssetIdRef("asset-1",),).toBe(true,);
    expect(isAssetIdRef("http://x/y.png",),).toBe(false,);
    expect(isAssetIdRef("/api/assets/a1/thumb",),).toBe(false,);
    expect(isAssetIdRef(undefined,),).toBe(false,);
    expect(isAssetIdRef("",),).toBe(false,);
  });
});

describe("createAnchorLoader", () => {
  test("fetches once per asset and maps rows to anchors", async () => {
    let calls = 0;
    const load = createAnchorLoader(async (id,) => {
      calls += 1;
      return id === "a1" ? { focal_point_x: 0.4, focal_point_y: 0.3, } : null;
    },);
    await expect(load("a1",),).resolves.toEqual({ x: 0.4, y: 0.3, },);
    await expect(load("a1",),).resolves.toEqual({ x: 0.4, y: 0.3, },);
    await expect(load("missing",),).resolves.toBeNull();
    expect(calls,).toBe(2,);
  });
  test("fetch rejection resolves to null", async () => {
    const load = createAnchorLoader(async () => {
      throw new Error("offline",);
    },);
    await expect(load("a1",),).resolves.toBeNull();
  });
});

describe("decorateStageAnchors", () => {
  function stageWith(ids: Array<string | null>,): unknown {
    const stage = makeEl("div",);
    for (const id of ids) {
      const sprite = makeEl("div",);
      sprite.className = "vn-stage-sprite";
      if (id) { sprite.dataset["assetId"] = id; }
      sprite.append(makeEl("img",),);
      stage.append(sprite,);
    }
    return stage as unknown;
  }
  test("applies fetched anchors, skips unstamped sprites", async () => {
    const stage = stageWith(["a1", null,],) as unknown as ParentNode;
    let fetched: string[] = [];
    await decorateStageAnchors(stage, async (id,): Promise<SpriteAnchor | null> => {
      fetched.push(id,);
      return { x: 0.4, y: 0.3, };
    },);
    expect(fetched,).toEqual(["a1",],);
    const imgs = (stage as unknown as { querySelectorAll(sel: string,): Array<{ style: Record<string, string> }> })
      .querySelectorAll("img",);
    expect(imgs[0]?.style["objectPosition"],).toBe("40% 30%",);
    expect(imgs[1]?.style["objectPosition"],).toBeUndefined();
  });
  test("null anchor clears, loader failure never rejects", async () => {
    const stage = stageWith(["a1", "a2",],) as unknown as ParentNode;
    await expect(decorateStageAnchors(stage, async (id,): Promise<SpriteAnchor | null> => {
      if (id === "a2") { throw new Error("offline",); }
      return null;
    },),).resolves.toBeUndefined();
  });
  test("sprite without an image is skipped", async () => {
    const stage = makeEl("div",);
    const sprite = makeEl("div",);
    sprite.className = "vn-stage-sprite";
    sprite.dataset["assetId"] = "a1";
    stage.append(sprite,);
    let fetched = 0;
    await decorateStageAnchors(stage as unknown as ParentNode, async (): Promise<SpriteAnchor | null> => {
      fetched += 1;
      return { x: 0.4, y: 0.3, };
    },);
    expect(fetched,).toBe(0,);
  });
});
