// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for giwtArgv: the sync shim must invoke the PINNED giwt from
 * node_modules, never an ambient `giwt` on PATH (which points at a mutable
 * local checkout and silently runs an unpinned build).
 */

import { describe, expect, it, } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { dirname, join, } from "node:path";
import { GIWT_CLI_RELATIVE, giwtArgv, } from "./sync";

/** A DIRECTORY at the pin path: passes existsSync, breaks the spawn. */
function checkoutWithDirAtPin(): string {
  const root = mkdtempSync(join(tmpdir(), "ll-sync-dirpin-",),);
  mkdirSync(join(root, GIWT_CLI_RELATIVE,), { recursive: true, },);
  return root;
}

/** Create a fake checkout with the pinned giwt entrypoint in place. */
function checkoutWithPinnedGiwt(): string {
  const root = mkdtempSync(join(tmpdir(), "ll-sync-pin-",),);
  const cli = join(root, GIWT_CLI_RELATIVE,);
  mkdirSync(dirname(cli,), { recursive: true, },);
  writeFileSync(cli, "// fake\n",);
  return root;
}

describe("giwtArgv", () => {
  it("runs the pinned node_modules copy through the current interpreter", () => {
    const root = checkoutWithPinnedGiwt();
    try {
      const { cmd, args, } = giwtArgv(root,);
      expect(cmd,).toBe(process.execPath,);
      expect(args,).toEqual([join(root, GIWT_CLI_RELATIVE,),],);
      // The ambient PATH must not be consulted when the pin resolves.
      expect(args.some((a,) => a === "giwt"),).toBe(false,);
    } finally {
      rmSync(root, { recursive: true, force: true, },);
    }
  });

  it("prefers the pinned copy even when a bare giwt is on PATH", () => {
    const root = checkoutWithPinnedGiwt();
    const prevPath = process.env.PATH;
    // A directory holding an unrelated `giwt` binary: if resolution were
    // ambient this would be picked up instead of the pin.
    const fakeBin = mkdtempSync(join(tmpdir(), "ll-sync-fakebin-",),);
    writeFileSync(join(fakeBin, "giwt",), "#!/bin/sh\nexit 99\n",);
    process.env.PATH = `${fakeBin}:${prevPath ?? ""}`;
    try {
      expect(giwtArgv(root,).args[0],).toBe(join(root, GIWT_CLI_RELATIVE,),);
    } finally {
      if (prevPath === undefined) {
        delete process.env.PATH;
      } else {
        process.env.PATH = prevPath;
      }
      rmSync(root, { recursive: true, force: true, },);
      rmSync(fakeBin, { recursive: true, force: true, },);
    }
  });

  it("falls back to the bare name when the pinned copy is absent", () => {
    const root = mkdtempSync(join(tmpdir(), "ll-sync-nopin-",),);
    try {
      expect(giwtArgv(root,),).toEqual({ cmd: "giwt", args: [], },);
    } finally {
      rmSync(root, { recursive: true, force: true, },);
    }
  });

  it("falls back when a DIRECTORY sits at the pin path", () => {
    // existsSync() accepts this, but spawning it exits 1 with "Module not
    // found" — a corrupt/partial install must degrade, not crash.
    const root = checkoutWithDirAtPin();
    try {
      expect(giwtArgv(root,),).toEqual({ cmd: "giwt", args: [], },);
    } finally {
      rmSync(root, { recursive: true, force: true, },);
    }
  });
});
