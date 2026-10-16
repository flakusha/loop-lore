// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the pure gallery-grid view-model.
 *
 * Resource contract: OWNS NOTHING. No database, clock, filesystem, network, or
 * env. Pure projection over caller-supplied rows — order-independent, no
 * teardown.
 */
import { describe, expect, test, } from "bun:test";
import { buildGalleryGridViewModel, formatSize, type GalleryAssetRow, } from "./gallery-grid";

/**
 * @param overrides
 */
function asset(overrides: Partial<GalleryAssetRow> = {},): GalleryAssetRow {
  return {
    id: "asset-1",
    filename: "sword.png",
    asset_type: "image",
    size_bytes: 2048,
    visibility: "public",
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("view-models/gallery-grid", () => {
  test("returns an empty assets array for no rows", () => {
    expect(buildGalleryGridViewModel({ assets: [], tagMap: new Map(), },),).toEqual({ assets: [], },);
  });

  test("projects id, filename, type and size label", () => {
    const { assets, } = buildGalleryGridViewModel({ assets: [asset(),], tagMap: new Map(), },);

    expect(assets,).toHaveLength(1,);
    expect(assets[0],).toEqual({
      id: "asset-1",
      filename: "sword.png",
      assetType: "image",
      sizeBytes: 2048,
      sizeLabel: "2.0 KB",
      thumbUrl: "/api/v1/assets/asset-1/thumb",
      tags: [],
      visibility: "public",
      createdAt: "2026-01-01T00:00:00.000Z",
    },);
  });

  test("derives a thumb url for images only", () => {
    const { assets, } = buildGalleryGridViewModel({
      assets: [asset({ id: "img", asset_type: "image", },), asset({ id: "snd", asset_type: "audio", },),],
      tagMap: new Map(),
    },);

    expect(assets[0]?.thumbUrl,).toBe("/api/v1/assets/img/thumb",);
    expect(assets[1]?.thumbUrl,).toBeNull();
  });

  test("carries the viewer's visible tags for the asset", () => {
    const tagMap = new Map([["asset-1", ["cozy", "mine",],],],);
    const { assets, } = buildGalleryGridViewModel({ assets: [asset(),], tagMap, },);

    expect(assets[0]?.tags,).toEqual(["cozy", "mine",],);
  });

  test("defaults missing tags to an empty array", () => {
    const { assets, } = buildGalleryGridViewModel({ assets: [asset(),], tagMap: new Map(), },);

    expect(assets[0]?.tags,).toEqual([],);
  });

  test("preserves the given row order", () => {
    const { assets, } = buildGalleryGridViewModel({
      assets: [asset({ id: "z", filename: "z.png", },), asset({ id: "a", filename: "a.png", },),],
      tagMap: new Map(),
    },);

    expect(assets.map((a,) => a.id),).toEqual(["z", "a",],);
  });

  test("keeps raw unescaped text so the JSON branch carries real values", () => {
    const { assets, } = buildGalleryGridViewModel({
      assets: [asset({ filename: "<script>x</script>", },),],
      tagMap: new Map(),
    },);

    expect(assets[0]?.filename,).toBe("<script>x</script>",);
  });

  test("formatSize matches the byte/kilobyte/megabyte bands", () => {
    expect(formatSize(10,),).toBe("10 B",);
    expect(formatSize(2048,),).toBe("2.0 KB",);
    expect(formatSize(3_145_728,),).toBe("3.0 MB",);
  });
});
