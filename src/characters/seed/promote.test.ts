// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/seed/promote.test.ts — promoteAvatarToDefault unit tests
//
// The promote op + the `file`-hook seed path it targets. `resolveTemplateAvatar`
// is the contract the promote op's `{ type: "file", path }` literal feeds:
// promote writes `configs/assets/characters/<slug>/default/happy.png`, and
// the seeder reads it back byte-for-byte, so a promoted file is what the next
// clean boot shows as the character's primary avatar.

import { describe, expect, test, } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import sharp from "sharp";
import { makeMinimalPng, } from "../../assets/test-helpers";
import { resolveTemplateAvatar, } from "./avatar";
import { promoteAvatarToDefault, slugForTemplate, } from "./promote";

/** A real 8x8 two-tone PNG so lossless round-trips are pixel-meaningful. */
async function makeRealPng(size = 8,): Promise<Buffer> {
  return await sharp({ create: { width: size, height: size, channels: 4, background: "#3366aa", }, },)
    .png({},)
    .toBuffer();
}

/** Decode any raster to raw pixels for exact comparison (alpha dropped —
 * the lossless webp encoder omits a fully-opaque alpha channel, so raw decodes
 * come back 3-channel while the PNG source decodes 4-channel). */
async function rawPixels(bytes: Buffer,) {
  return await sharp(bytes,).removeAlpha().raw({},).toBuffer({ resolveWithObject: true, },);
}

describe("promoteAvatarToDefault", () => {
  test("converts to a lossless webp master by default (slice 2)", async () => {
    const root = mkdtempSync(join(tmpdir(), "loop-lore-promote-",),);
    try {
      const png = await makeRealPng(8,);
      const out = await promoteAvatarToDefault({
        template: { id: "tpl-elara-nightwhisper", name: "Elara Nightwhisper", },
        bytes: png,
        repoRoot: root,
      },);

      expect(out.path,).toBe("configs/assets/characters/elara-nightwhisper/default/happy.webp",);
      expect(out.avatar,).toEqual({ type: "file", path: out.path, },);
      expect(out.replaced,).toBe(true,);

      const master = readFileSync(join(root, ...out.path.split("/",),),);
      expect(master.subarray(0, 4,).toString("ascii",),).toBe("RIFF",);
      expect(master.subarray(8, 12,).toString("ascii",),).toBe("WEBP",);

      // Lossless contract: decoding the master yields the source pixels.
      const src = await rawPixels(png,);
      const decoded = await rawPixels(master,);
      expect({ width: decoded.info.width, height: decoded.info.height, },)
        .toEqual({ width: src.info.width, height: src.info.height, },);

      expect(decoded.data.equals(src.data,),).toBe(true,);
    } finally {
      rmSync(root, { recursive: true, force: true, },);
    }
  });

  test("re-promoting identical input is a no-op; new bytes replace (webp)", async () => {
    const root = mkdtempSync(join(tmpdir(), "loop-lore-promote-",),);
    try {
      const opts = { template: { id: "tpl-aria-7", name: "ARIA-7", }, repoRoot: root, };
      const first = await promoteAvatarToDefault({ ...opts, bytes: await makeRealPng(8,), },);
      const same = await promoteAvatarToDefault({ ...opts, bytes: await makeRealPng(8,), },);
      expect(first.replaced,).toBe(true,);
      expect(same.replaced,).toBe(false,);
      expect(same.path,).toBe(first.path,);
      const other = await promoteAvatarToDefault({ ...opts, bytes: await makeRealPng(9,), },);
      expect(other.replaced,).toBe(true,);
    } finally {
      rmSync(root, { recursive: true, force: true, },);
    }
  });

  test("master: 'png' keeps the slice-1 byte-for-byte PNG cell", async () => {
    const root = mkdtempSync(join(tmpdir(), "loop-lore-promote-",),);
    try {
      const bytes = makeMinimalPng(2, 2,);
      const out = await promoteAvatarToDefault({
        template: { id: "tpl-yuki-tanaka", name: "Yuki Tanaka", },
        bytes,
        repoRoot: root,
        master: "png",
      },);

      expect(out.path,).toBe("configs/assets/characters/yuki-tanaka/default/happy.png",);
      expect(out.replaced,).toBe(true,);
      expect(readFileSync(join(root, ...out.path.split("/",),),).equals(bytes,),).toBe(true,);

      const again = await promoteAvatarToDefault({
        template: { id: "tpl-yuki-tanaka", name: "Yuki Tanaka", },
        bytes,
        repoRoot: root,
        master: "png",
      },);

      expect(again.replaced,).toBe(false,);
    } finally {
      rmSync(root, { recursive: true, force: true, },);
    }
  });

  test("slugifies id-less templates and rejects non-PNG bytes", async () => {
    expect(slugForTemplate({ name: "Assistant", },),).toBe("assistant",);
    await expect(
      promoteAvatarToDefault({
        template: { name: "Assistant", },
        bytes: Buffer.from("not a png", "utf8",),
        repoRoot: mkdtempSync(join(tmpdir(), "loop-lore-promote-",),),
      },),
    ).rejects.toThrow(/must be PNG/,);
  });

  test("seed file hook reads back promoted webp and png masters with the right mime", async () => {
    const root = mkdtempSync(join(tmpdir(), "loop-lore-promote-",),);
    try {
      const webpOut = await promoteAvatarToDefault({
        template: { id: "tpl-detective-morgan", name: "Detective Morgan", },
        bytes: await makeRealPng(8,),
        repoRoot: root,
      },);

      const webpResolved = resolveTemplateAvatar({ type: "file", path: join(root, ...webpOut.path.split("/",),), },);
      expect(webpResolved,).not.toBeNull();
      expect(webpResolved!.buffer.subarray(8, 12,).toString("ascii",),).toBe("WEBP",);
      // AC3: the existing mimeFromExtension mapping serves webp — verified,
      // not rebuilt.
      expect(webpResolved!.mimeType,).toBe("image/webp",);

      const pngBytes = makeMinimalPng(2, 2,);
      const pngOut = await promoteAvatarToDefault({
        template: { id: "tpl-dr-alexis-thorne", name: "Dr. Alexis Thorne", },
        bytes: pngBytes,
        repoRoot: root,
        master: "png",
      },);

      const pngResolved = resolveTemplateAvatar({ type: "file", path: join(root, ...pngOut.path.split("/",),), },);
      expect(pngResolved!.buffer.equals(pngBytes,),).toBe(true,);
      expect(pngResolved!.mimeType,).toBe("image/png",);
    } finally {
      rmSync(root, { recursive: true, force: true, },);
    }
  });
});
