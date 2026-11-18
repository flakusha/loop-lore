// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for assets/service/file-system.ts — path resolution, forbidden-root
 * guards, and the store/delete/get helpers.
 */

import { afterEach, beforeEach, describe, expect, spyOn, test, } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { dirname, join, } from "node:path";
import { DATA_DIR, } from "../../config/constants";
import { ASSETS_DEFAULTS, } from "../../config/sections/assets";
import { resolveDbPath, resolveInstanceDir, } from "../../config/state-dir";
import { deleteFile, getAssetFilePath, isStoragePathInUploadDir, resolveUploadDir, storeFile, } from "./file-system";

const ASSET_ID = "aabbccddeeff00112233445566778899";

describe("resolveUploadDir", () => {
  test("returns a normalised absolute path for a relative input", () => {
    const dir = resolveUploadDir("./test-uploads",);
    expect(dir,).toBe(join(resolveInstanceDir(process.env,), "test-uploads",),);
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

describe("resolveUploadDir — instance anchoring (F10)", () => {
  const ENV_STATE = "LOOP_LORE_STATE_DIR";
  const ENV_INSTANCE = "LOOP_LORE_INSTANCE";
  let savedState: string | undefined;
  let savedInstance: string | undefined;
  let stateRoot = "";

  beforeEach(() => {
    savedState = process.env[ENV_STATE];
    savedInstance = process.env[ENV_INSTANCE];
    stateRoot = mkdtempSync(join(tmpdir(), "loop-lore-instance-",),);
    process.env[ENV_STATE] = stateRoot;
    process.env[ENV_INSTANCE] = "alpha";
  },);

  afterEach(() => {
    if (savedState === undefined) { delete process.env[ENV_STATE]; }
    else { process.env[ENV_STATE] = savedState; }

    if (savedInstance === undefined) { delete process.env[ENV_INSTANCE]; }
    else { process.env[ENV_INSTANCE] = savedInstance; }

    rmSync(stateRoot, { recursive: true, force: true, },);
  },);

  test("resolves a relative upload dir inside the instance dir", () => {
    expect(resolveUploadDir("uploads",),).toBe(join(stateRoot, "alpha", "uploads",),);
  });

  test("does not depend on the process cwd", () => {
    const before = resolveUploadDir("uploads",);
    const cwd = spyOn(process, "cwd",).mockReturnValue("/tmp/some-other-cwd",);
    try {
      expect(resolveUploadDir("uploads",),).toBe(before,);
    } finally {
      cwd.mockRestore();
    }
  });

  test("keeps an absolute upload dir as-is", () => {
    const absolute = join(tmpdir(), "absolute-upload",);
    expect(resolveUploadDir(absolute,),).toBe(absolute,);
  });

  test("honours an explicitly injected instance dir", () => {
    const injected = join(tmpdir(), "injected-instance",);
    expect(resolveUploadDir("uploads", { instanceDir: injected, },),).toBe(join(injected, "uploads",),);
  });
});

describe("resolveUploadDir — runtime instance dir (B1)", () => {
  const ENV_STATE = "LOOP_LORE_STATE_DIR";
  const ENV_INSTANCE = "LOOP_LORE_INSTANCE";
  const ENV_PORT = "PORT";
  const ENV_DB_PATH = "LOOP_LORE_DB_PATH";
  let savedState: string | undefined;
  let savedInstance: string | undefined;
  let savedPort: string | undefined;
  let savedDbPath: string | undefined;
  let stateRoot = "";

  beforeEach(() => {
    savedState = process.env[ENV_STATE];
    savedInstance = process.env[ENV_INSTANCE];
    savedPort = process.env[ENV_PORT];
    savedDbPath = process.env[ENV_DB_PATH];
    stateRoot = mkdtempSync(join(tmpdir(), "loop-lore-b1-instance-",),);
    process.env[ENV_STATE] = stateRoot;
    delete process.env[ENV_INSTANCE];
    delete process.env[ENV_PORT];
    delete process.env[ENV_DB_PATH];
  },);

  afterEach(() => {
    if (savedState === undefined) { delete process.env[ENV_STATE]; }
    else { process.env[ENV_STATE] = savedState; }

    if (savedInstance === undefined) { delete process.env[ENV_INSTANCE]; }
    else { process.env[ENV_INSTANCE] = savedInstance; }

    if (savedPort === undefined) { delete process.env[ENV_PORT]; }
    else { process.env[ENV_PORT] = savedPort; }

    if (savedDbPath === undefined) { delete process.env[ENV_DB_PATH]; }
    else { process.env[ENV_DB_PATH] = savedDbPath; }

    rmSync(stateRoot, { recursive: true, force: true, },);
  },);

  test("unnamed instance on port 4000: the shipped default lands in the runtime instance dir", () => {
    process.env[ENV_PORT] = "4000";
    const bind = { port: 4000, host: "localhost", };
    const runtimeDir = resolveInstanceDir(process.env, bind,);
    const dbDir = dirname(resolveDbPath(process.env, bind,),);

    expect(dbDir,).toBe(runtimeDir,);
    expect(resolveUploadDir(ASSETS_DEFAULTS.uploadDir,),).toBe(join(runtimeDir, "uploads",),);
  });

  test("named instance: the shipped default lands in the named instance dir", () => {
    process.env[ENV_INSTANCE] = "alpha";
    const runtimeDir = resolveInstanceDir(process.env,);

    expect(runtimeDir,).toBe(join(stateRoot, "alpha",),);
    expect(resolveUploadDir(ASSETS_DEFAULTS.uploadDir,),).toBe(join(runtimeDir, "uploads",),);
  });

  test("keeps a custom absolute upload dir verbatim", () => {
    const custom = join(tmpdir(), "mnt", "assets",);
    expect(resolveUploadDir(custom,),).toBe(custom,);
  });

  test("re-anchors a legacy absolute DATA_DIR upload dir onto the runtime instance dir", () => {
    process.env[ENV_INSTANCE] = "alpha";
    const runtimeDir = resolveInstanceDir(process.env,);

    expect(resolveUploadDir(join(DATA_DIR, "uploads",),),).toBe(join(runtimeDir, "uploads",),);
  });

  test("resolves the portable ${DATA_DIR} placeholder onto the runtime instance dir", () => {
    process.env[ENV_INSTANCE] = "alpha";
    const runtimeDir = resolveInstanceDir(process.env,);

    expect(resolveUploadDir("${DATA_DIR}/uploads",),).toBe(join(runtimeDir, "uploads",),);
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

describe("isStoragePathInUploadDir", () => {
  test("accepts a relative path inside the upload dir", () => {
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-fs-inscope-",),);
    try {
      expect(isStoragePathInUploadDir(uploadDir, "raw/aa/bb/x.png",),).toBe(true,);
      expect(isStoragePathInUploadDir(uploadDir, join(uploadDir, "raw", "aa", "bb", "x.png",),),).toBe(true,);
    } finally {
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });

  test("rejects a path outside the upload dir", () => {
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-fs-outscope-",),);
    try {
      expect(isStoragePathInUploadDir(uploadDir, "/etc/passwd",),).toBe(false,);
      expect(isStoragePathInUploadDir(uploadDir, "../../../../etc/passwd",),).toBe(false,);
    } finally {
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });

  test("rejects a sibling-directory prefix trap", () => {
    // Root `<tmp>/up`, target `<tmp>/uploads-evil/x`. A naive `startsWith(root)`
    // would accept this because `<tmp>/uploads-evil` starts with `<tmp>/up`.
    const base = mkdtempSync(join(tmpdir(), "ll-fs-sibling-pfx-",),);
    const root = join(base, "up",);
    const sibling = join(base, "uploads-evil",);
    mkdirSync(root, { recursive: true, },);
    mkdirSync(sibling, { recursive: true, },);
    try {
      expect(isStoragePathInUploadDir(root, "../uploads-evil/x",),).toBe(false,);
    } finally {
      rmSync(base, { recursive: true, force: true, },);
    }
  });
});
