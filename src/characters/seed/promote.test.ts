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
import { makeMinimalPng, } from "../../assets/test-helpers";
import { resolveTemplateAvatar, } from "./avatar";
import { promoteAvatarToDefault, slugForTemplate, } from "./promote";

describe("promoteAvatarToDefault", () => {
  test("copies bytes into the template cell and returns the file literal", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-lore-promote-",),);
    try {
      const bytes = makeMinimalPng(2, 2,);
      const out = promoteAvatarToDefault({
        template: { id: "tpl-elara-nightwhisper", name: "Elara Nightwhisper", },
        bytes,
        repoRoot: root,
      },);

      expect(out.path,).toBe("configs/assets/characters/elara-nightwhisper/default/happy.png",);
      expect(out.avatar,).toEqual({ type: "file", path: out.path, },);
      expect(out.replaced,).toBe(true,);
      expect(readFileSync(join(root, ...out.path.split("/",),),).equals(bytes,),).toBe(true,);
    } finally {
      rmSync(root, { recursive: true, force: true, },);
    }
  });

  test("re-promoting identical bytes is a no-op; new bytes replace", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-lore-promote-",),);
    try {
      const opts = { template: { id: "tpl-aria-7", name: "ARIA-7", }, repoRoot: root, };
      const first = promoteAvatarToDefault({ ...opts, bytes: makeMinimalPng(2, 2,), },);
      const same = promoteAvatarToDefault({ ...opts, bytes: makeMinimalPng(2, 2,), },);
      expect(first.replaced,).toBe(true,);
      expect(same.replaced,).toBe(false,);
      expect(same.path,).toBe(first.path,);
      const other = promoteAvatarToDefault({ ...opts, bytes: makeMinimalPng(3, 3,), },);
      expect(other.replaced,).toBe(true,);
    } finally {
      rmSync(root, { recursive: true, force: true, },);
    }
  });

  test("slugifies id-less templates and rejects non-PNG bytes", () => {
    expect(slugForTemplate({ name: "Assistant", },),).toBe("assistant",);
    expect(() =>
      promoteAvatarToDefault({
        template: { name: "Assistant", },
        bytes: Buffer.from("not a png", "utf8",),
        repoRoot: mkdtempSync(join(tmpdir(), "loop-lore-promote-",),),
      },)
    ).toThrow(/PNG masters only/,);
  });

  test("seed file hook reads back the promoted bytes", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-lore-promote-",),);
    try {
      const bytes = makeMinimalPng(2, 2,);
      const out = promoteAvatarToDefault({
        template: { id: "tpl-detective-morgan", name: "Detective Morgan", },
        bytes,
        repoRoot: root,
      },);

      const resolved = resolveTemplateAvatar({ type: "file", path: join(root, ...out.path.split("/",),), },);
      expect(resolved,).not.toBeNull();
      expect(resolved!.buffer.equals(bytes,),).toBe(true,);
      expect(resolved!.mimeType,).toBe("image/png",);
    } finally {
      rmSync(root, { recursive: true, force: true, },);
    }
  });
});
