// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { mkdtempSync, rmSync, symlinkSync, } from "node:fs";
import { tmpdir, } from "node:os";
import path from "node:path";
import { appTmpRoot, } from "./tmp-root";

describe("appTmpRoot", () => {
  test("creates an isolated subsystem directory under the default base", () => {
    const subsystem = `tmp-root-${process.pid}`;
    const root = appTmpRoot(subsystem,);
    try {
      expect(root,).toBe(path.join(tmpdir(), "loop-lore", subsystem,),);
      expect(root.endsWith(subsystem,),).toBe(true,);
    } finally {
      rmSync(root, { recursive: true, force: true, },);
    }
  });

  test("honors an override and rejects a symlink escape", () => {
    const previous = process.env.LOOP_LORE_TMP_ROOT;
    const base = mkdtempSync(path.join(tmpdir(), "tmp-root-base-",),);
    try {
      process.env.LOOP_LORE_TMP_ROOT = base;
      const root = appTmpRoot("override",);
      expect(root.startsWith(base + path.sep,),).toBe(true,);
      const outside = mkdtempSync(path.join(tmpdir(), "tmp-root-outside-",),);
      try {
        symlinkSync(outside, path.join(root, "..", "escape",), "dir",);
        expect(() => appTmpRoot("escape",)).toThrow(/escaped base/,);
      } finally {
        rmSync(outside, { recursive: true, force: true, },);
      }
    } finally {
      if (previous === undefined) {
        delete process.env.LOOP_LORE_TMP_ROOT;
      } else {
        process.env.LOOP_LORE_TMP_ROOT = previous;
      }

      rmSync(base, { recursive: true, force: true, },);
    }
  });
});
