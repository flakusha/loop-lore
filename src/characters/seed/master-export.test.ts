// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for master-export.ts — Avatar Dogfood slice 2 export op
 * (TASK-avatar-dogfood-webp-export): png/jpg rendering of a promoted
 * lossless-webp master, and the webp-only input contract.
 */
import { describe, expect, test, } from "bun:test";
import sharp from "sharp";
import { exportAvatarMaster, } from "./master-export";

const PNG_MAGIC = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10,],);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8,],);

/** A real 8x8 solid-color PNG input, promoted to a lossless webp master. */
async function makeWebpMaster(size = 8,): Promise<Buffer> {
  const png = await sharp({ create: { width: size, height: size, channels: 4, background: "#aa3366", }, },)
    .png({},)
    .toBuffer();

  return await sharp(png,).webp({ lossless: true, },).toBuffer();
}

describe("exportAvatarMaster", () => {
  test("renders a webp master to png with pixel-exact output", async () => {
    const master = await makeWebpMaster(8,);
    const exported = await exportAvatarMaster({ bytes: master, format: "png", },);

    expect(exported.subarray(0, PNG_MAGIC.length,).equals(PNG_MAGIC,),).toBe(true,);

    const src = await sharp(master,).removeAlpha().raw({},).toBuffer({ resolveWithObject: true, },);
    const out = await sharp(exported,).removeAlpha().raw({},).toBuffer({ resolveWithObject: true, },);
    expect({ width: out.info.width, height: out.info.height, },)
      .toEqual({ width: src.info.width, height: src.info.height, },);

    expect(out.data.equals(src.data,),).toBe(true,);
  });

  test("renders a webp master to jpg (smoke: JPEG magic + decodes)", async () => {
    const master = await makeWebpMaster(8,);
    const exported = await exportAvatarMaster({ bytes: master, format: "jpg", },);

    expect(exported.subarray(0, JPEG_MAGIC.length,).equals(JPEG_MAGIC,),).toBe(true,);
    const meta = await sharp(exported,).metadata();
    expect(meta.format,).toBe("jpeg",);
    expect(meta.width,).toBe(8,);
  });

  test("refuses non-webp input", async () => {
    const png = await sharp({ create: { width: 4, height: 4, channels: 4, background: "#000", }, },)
      .png({},).toBuffer();

    await expect(exportAvatarMaster({ bytes: png, format: "png", },),)
      .rejects.toThrow(/must be a webp master/,);
  });
});
