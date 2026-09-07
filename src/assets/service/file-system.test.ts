// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for assets/service/file-system.ts — path resolution, forbidden-root
 * guards, and the store/delete/get helpers.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deleteFile, getAssetFilePath, resolveUploadDir, storeFile } from "./file-system";

const ASSET_ID = "aabbccddeeff00112233445566778899";

describe("resolveUploadDir", () => {
  test("returns a normalised absolute path for a relative input", () => {
    const dir = resolveUploadDir("./test-uploads");
    expect(dir).toBe(join(process.cwd(), "test-uploads"));
  });

  test("returns a normalised absolute path for an absolute input", () => {
    const dir = resolveUploadDir("/tmp/absolute-upload");
    expect(dir).toBe("/tmp/absolute-upload");
  });

  test("throws for the root filesystem path", () => {
    expect(() => resolveUploadDir("/")).toThrow("forbidden");
  });

  test("throws for /etc", () => {
    expect(() => resolveUploadDir("/etc")).toThrow("forbidden");
  });

  test("throws for /usr/bin", () => {
    expect(() => resolveUploadDir("/usr/bin")).toThrow("forbidden");
  });

  test("throws for /home (shallow user directory)", () => {
    expect(() => resolveUploadDir("/home")).toThrow("forbidden");
  });

  test("throws for /home/user (direct child of /home)", () => {
    expect(() => resolveUploadDir("/home/someuser")).toThrow("forbidden");
  });

  test("allows deep paths under /home (e.g. /home/user/projects)", () => {
    expect(resolveUploadDir("/home/testuser/my-project/uploads")).toBe("/home/testuser/my-project/uploads");
  });
});

describe("storeFile", () => {
  test("writes a file and returns the relative storage path", () => {
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-fs-store-"));
    try {
      const buf = Buffer.from("hello world");
      const path = storeFile(uploadDir, ASSET_ID, "test.txt", buf);
      expect(path).toMatch(/^raw\/..\/..\//);
      expect(existsSync(join(uploadDir, path))).toBe(true);
    } finally {
      rmSync(uploadDir, { recursive: true, force: true });
    }
  });

  test("stores file without extension when none provided", () => {
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-fs-noext-"));
    try {
      const buf = Buffer.from("no extension here");
      const path = storeFile(uploadDir, ASSET_ID, "noextension", buf);
      expect(existsSync(join(uploadDir, path))).toBe(true);
    } finally {
      rmSync(uploadDir, { recursive: true, force: true });
    }
  });

  test("uppercase extension is lowercased", () => {
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-fs-upper-"));
    try {
      const buf = Buffer.from("png data");
      const path = storeFile(uploadDir, ASSET_ID, "photo.PNG", buf);
      expect(path).toEndWith(".png");
    } finally {
      rmSync(uploadDir, { recursive: true, force: true });
    }
  });

  test("non-alphanumeric extension (e.g. .tar.gz) uses only the last part which is kept if alphanum", () => {
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-fs-alphanum-"));
    try {
      const buf = Buffer.from("data");
      // ".tar.gz" → rawExt = "gz" (alphanum) → kept
      const path = storeFile(uploadDir, ASSET_ID, "archive.tar.gz", buf);
      expect(path).toEndWith(".gz");
    } finally {
      rmSync(uploadDir, { recursive: true, force: true });
    }
  });

  test("extension longer than 10 chars is dropped", () => {
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-fs-long-ext-"));
    try {
      const buf = Buffer.from("data");
      const path = storeFile(uploadDir, ASSET_ID, "file.thisisaverylongextension", buf);
      expect(path).not.toContain(".");
    } finally {
      rmSync(uploadDir, { recursive: true, force: true });
    }
  });
});

describe("deleteFile", () => {
  test("removes an existing file", () => {
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-fs-del-"));
    try {
      const subDir = join(uploadDir, "raw", "aa", "bb");
      mkdirSync(subDir, { recursive: true });
      const filePath = join(subDir, "file.txt");
      writeFileSync(filePath, "content");
      expect(existsSync(filePath)).toBe(true);
      deleteFile(uploadDir, "raw/aa/bb/file.txt");
      expect(existsSync(filePath)).toBe(false);
    } finally {
      rmSync(uploadDir, { recursive: true, force: true });
    }
  });

  test("is a silent no-op when the file does not exist", () => {
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-fs-del-missing-"));
    try {
      expect(() => deleteFile(uploadDir, "raw/zz/zz/missing.txt")).not.toThrow();
    } finally {
      rmSync(uploadDir, { recursive: true, force: true });
    }
  });
});

describe("getAssetFilePath", () => {
  test("returns the joined absolute path", () => {
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-fs-getpath-"));
    try {
      const full = getAssetFilePath(uploadDir, "raw/aa/bb/asset.png");
      expect(full).toBe(join(uploadDir, "raw", "aa", "bb", "asset.png"));
    } finally {
      rmSync(uploadDir, { recursive: true, force: true });
    }
  });
});
