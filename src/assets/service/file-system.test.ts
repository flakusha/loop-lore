// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for assets/service/file-system.ts — path resolution, forbidden-root
 * guards, and the store/delete/get helpers.
 */

import { describe, expect, test, } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { deleteFile, getAssetFilePath, resolveUploadDir, storeFile, } from "./file-system";

const ASSET_ID = "aabbccddeeff00112233445566778899";

describe("resolveUploadDir", () => {
  test("returns a normalised absolute path for a relative input", () => {
    const dir = resolveUploadDir("./test-uploads",);
    expect(dir,).toBe(join(process.cwd(), "test-uploads",),);
  });

  test("returns a normalised absolute path for an absolute input", () => {
    const absolute = join(tmpdir(), "absolute-upload",);
    const dir = resolveUploadDir(absolute,);
    expect(dir,).toBe(absolute,);
  });

  test("throws for the root filesystem path", () => {
    expect(() => resolveUploadDir("/",)).toThrow("forbidden",);
  });

  test("throws for /etc", () => {
    expect(() => resolveUploadDir("/etc",)).toThrow("forbidden",);
  });

  test("throws for /usr/bin", () => {
    expect(() => resolveUploadDir("/usr/bin",)).toThrow("forbidden",);
  });

  test("throws for /home (shallow user directory)", () => {
    expect(() => resolveUploadDir("/home",)).toThrow("forbidden",);
  });

  test("throws for /home/user (direct child of /home)", () => {
    expect(() => resolveUploadDir("/home/someuser",)).toThrow("forbidden",);
  });

  test("allows deep paths under /home (e.g. /home/user/projects)", () => {
    expect(resolveUploadDir("/home/testuser/my-project/uploads",),).toBe("/home/testuser/my-project/uploads",);
  });
});

describe("storeFile", () => {
  test("writes a file and returns the relative storage path", () => {
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-fs-store-",),);
    try {
      const buf = Buffer.from("hello world",);
      const path = storeFile(uploadDir, ASSET_ID, "test.txt", buf,);
      expect(path,).toMatch(/^raw\/..\/..\//,);
      expect(existsSync(join(uploadDir, path,),),).toBe(true,);
    } finally {
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });

  test("stores file without extension when none provided", () => {
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-fs-noext-",),);
    try {
      const buf = Buffer.from("no extension here",);
      const path = storeFile(uploadDir, ASSET_ID, "noextension", buf,);
      expect(existsSync(join(uploadDir, path,),),).toBe(true,);
    } finally {
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });

  test("uppercase extension is lowercased", () => {
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-fs-upper-",),);
    try {
      const buf = Buffer.from("png data",);
      const path = storeFile(uploadDir, ASSET_ID, "photo.PNG", buf,);
      expect(path,).toEndWith(".png",);
    } finally {
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });

  test("non-alphanumeric extension (e.g. .tar.gz) uses only the last part which is kept if alphanum", () => {
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-fs-alphanum-",),);
    try {
      const buf = Buffer.from("data",);
      // ".tar.gz" → rawExt = "gz" (alphanum) → kept
      const path = storeFile(uploadDir, ASSET_ID, "archive.tar.gz", buf,);
      expect(path,).toEndWith(".gz",);
    } finally {
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });

  test("extension longer than 10 chars is dropped", () => {
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-fs-long-ext-",),);
    try {
      const buf = Buffer.from("data",);
      const path = storeFile(uploadDir, ASSET_ID, "file.thisisaverylongextension", buf,);
      expect(path,).not.toContain(".",);
    } finally {
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });
});

describe("deleteFile", () => {
  test("removes an existing file", () => {
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-fs-del-",),);
    try {
      const subDir = join(uploadDir, "raw", "aa", "bb",);
      mkdirSync(subDir, { recursive: true, },);
      const filePath = join(subDir, "file.txt",);
      writeFileSync(filePath, "content",);
      expect(existsSync(filePath,),).toBe(true,);
      deleteFile(uploadDir, "raw/aa/bb/file.txt",);
      expect(existsSync(filePath,),).toBe(false,);
    } finally {
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });

  test("is a silent no-op when the file does not exist", () => {
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-fs-del-missing-",),);
    try {
      expect(() => deleteFile(uploadDir, "raw/zz/zz/missing.txt",)).not.toThrow();
    } finally {
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });
});

describe("getAssetFilePath", () => {
  test("returns the joined absolute path", () => {
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-fs-getpath-",),);
    try {
      const full = getAssetFilePath(uploadDir, "raw/aa/bb/asset.png",);
      expect(full,).toBe(join(uploadDir, "raw", "aa", "bb", "asset.png",),);
    } finally {
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });
});

describe("path traversal containment (DB-controlled storage_path)", () => {
  test("rejects a relative `..` traversal", () => {
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-fs-trav-",),);
    try {
      expect(() => getAssetFilePath(uploadDir, "../../../../etc/passwd",)).toThrow(
        "Refusing to serve outside upload dir",
      );
    } finally {
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });

  test("rejects an absolute path", () => {
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-fs-abs-",),);
    try {
      expect(() => getAssetFilePath(uploadDir, "/etc/passwd",)).toThrow(
        "Refusing to serve outside upload dir",
      );
    } finally {
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });

  test("rejects a sibling-directory prefix trap", () => {
    // Root `<tmp>/up`, target `<tmp>/uploads-evil/x`. A naive `startsWith(root)`
    // would accept this because `<tmp>/uploads-evil` starts with `<tmp>/up`.
    const base = mkdtempSync(join(tmpdir(), "ll-fs-sibling-",),);
    const root = join(base, "up",);
    const sibling = join(base, "uploads-evil",);
    mkdirSync(root, { recursive: true, },);
    mkdirSync(sibling, { recursive: true, },);
    try {
      expect(() => getAssetFilePath(root, "../uploads-evil/x",)).toThrow(
        "Refusing to serve outside upload dir",
      );
    } finally {
      rmSync(base, { recursive: true, force: true, },);
    }
  });

  test("still resolves a legitimate in-root path", () => {
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-fs-legit-",),);
    try {
      const full = getAssetFilePath(uploadDir, `raw/${ASSET_ID.slice(0, 2,)}/${ASSET_ID.slice(2, 4,)}/x.png`,);
      expect(full,).toBe(join(uploadDir, "raw", "aa", "bb", "x.png",),);
    } finally {
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });

  test("deleteFile refuses a traversal path and leaves the canary on disk", () => {
    // The canary lives OUTSIDE the upload root. Asserting it still exists is
    // what proves the delete hole is closed — asserting "throws" alone would
    // also pass if the file were unlinked before the guard ran.
    const base = mkdtempSync(join(tmpdir(), "ll-fs-canary-",),);
    const uploadDir = join(base, "up",);
    mkdirSync(uploadDir, { recursive: true, },);
    const canary = join(base, "canary.txt",);
    writeFileSync(canary, "do not delete me",);
    try {
      expect(() => deleteFile(uploadDir, "../canary.txt",)).toThrow("Refusing to delete outside upload dir",);
      expect(existsSync(canary,),).toBe(true,);
    } finally {
      rmSync(base, { recursive: true, force: true, },);
    }
  });

  test("deleteFile refuses an absolute path and leaves the canary on disk", () => {
    const base = mkdtempSync(join(tmpdir(), "ll-fs-delabs-",),);
    const uploadDir = join(base, "up",);
    mkdirSync(uploadDir, { recursive: true, },);
    const canary = join(base, "canary.txt",);
    writeFileSync(canary, "do not delete me",);
    try {
      expect(() => deleteFile(uploadDir, canary,)).toThrow("Refusing to delete outside upload dir",);
      expect(existsSync(canary,),).toBe(true,);
    } finally {
      rmSync(base, { recursive: true, force: true, },);
    }
  });

  test("deleteFile still removes a legitimate in-root file", () => {
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-fs-delok-",),);
    try {
      const storagePath = storeFile(uploadDir, ASSET_ID, "note.txt", Buffer.from("x",),);
      expect(existsSync(getAssetFilePath(uploadDir, storagePath,),),).toBe(true,);
      deleteFile(uploadDir, storagePath,);
      expect(existsSync(getAssetFilePath(uploadDir, storagePath,),),).toBe(false,);
    } finally {
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });
});
