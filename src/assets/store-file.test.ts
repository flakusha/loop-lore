// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { beforeEach, describe, expect, test, } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, } from "node:fs";
import { join, } from "node:path";
import { storeFile, } from "./service/file-system";

describe("storeFile path traversal", () => {
  let uploadDir: string;

  beforeEach(() => {
    uploadDir = mkdtempSync(join("/tmp", "ll-assets-",),);
  },);

  test("benign filename keeps its extension", () => {
    const p = storeFile(uploadDir, "abcdef01", "photo.PNG", Buffer.from("x",),);
    expect(p,).toBe("raw/ab/cd/abcdef01.png",);
  });

  test("traversal filename cannot escape upload root", () => {
    const p = storeFile(uploadDir, "abcdef02", "../../pwned.sh", Buffer.from("x",),);
    expect(p.startsWith("raw/",),).toBe(true,);
    // Nothing written outside the root
    const written = readFileSync(join(uploadDir, p,),).toString();
    expect(written,).toBe("x",);
    expect(readdirSync(uploadDir,).sort(),).toEqual(["raw",],);
  });

  test("slash-bearing extension is dropped", () => {
    const p = storeFile(uploadDir, "abcdef03", "x/../../../etc/cron", Buffer.from("x",),);
    expect(p,).toBe("raw/ab/cd/abcdef03",);
  });

  test("overlong or special-char extension is dropped", () => {
    expect(storeFile(uploadDir, "abcdef04", "f.abcdefghijklm", Buffer.from("x",),),).toBe("raw/ab/cd/abcdef04",);
    expect(storeFile(uploadDir, "abcdef05", "f.a b", Buffer.from("x",),),).toBe("raw/ab/cd/abcdef05",);
  });

  test("backslash separators are treated as path separators", () => {
    const p = storeFile(uploadDir, "abcdef06", "..\\..\\evil.txt", Buffer.from("x",),);
    expect(p,).toBe("raw/ab/cd/abcdef06.txt",);
  });
});
