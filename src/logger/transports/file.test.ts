/**
 * Tests for logger/transports/file.ts — FileTransport (JSONL + rotation)
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { mkdtemp, readdir, readFile, rm, stat, } from "node:fs/promises";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import type { LogEntry, } from "../types";
import { FileTransport, } from "./file";

const entry = (level: number, message: string,): LogEntry => ({
  level,
  timestamp: 1_800_000_000,
  time: "20260704T143000.123+02:00",
  message,
});

describe("FileTransport", () => {
  let dir: string;
  let logPath: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "ll-filelog-",),);
    logPath = join(dir, "app.log",);
  },);

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true, },);
  },);

  test("has name 'file'", () => {
    const t = new FileTransport({ path: logPath, },);
    expect(t.name,).toBe("file",);
  });

  test("write appends one JSON line per entry", async () => {
    const t = new FileTransport({ path: logPath, },);
    await t.write(entry(20, "first",),);
    await t.write(entry(30, "second",),);

    const content = await readFile(logPath, "utf8",);
    const lines = content.trim().split("\n",);
    expect(lines.length,).toBe(2,);
    expect(JSON.parse(lines[0]!,).message,).toBe("first",);
    expect(JSON.parse(lines[0]!,).level,).toBe(20,);
    expect(JSON.parse(lines[1]!,).message,).toBe("second",);
  });

  test("creates parent directories", async () => {
    const nested = join(dir, "nested", "sub", "app.log",);
    const t = new FileTransport({ path: nested, },);
    await t.write(entry(20, "nested",),);
    const s = await stat(nested,);
    expect(s.size,).toBeGreaterThan(0,);
  });

  test("rotates when maxBytes exceeded and shifts rotation files", async () => {
    const rotPath = join(dir, "rot.log",);
    const t = new FileTransport({ path: rotPath, maxBytes: 40, maxFiles: 2, },);

    // Each line is ~50 bytes; write enough to force multiple rotations.
    for (let i = 0; i < 10; i++) {
      await t.write(entry(20, `rotation message ${i}`,),);
    }

    const files = new Set((await readdir(dir,)).filter((f,) => f.startsWith("rot.log",)),);
    // Active + up to maxFiles(=2) rotation files; older ones get dropped.
    expect(files.has("rot.log",),).toBe(true,);
    // No file beyond path.(maxFiles) remains.
    expect(files.has("rot.log.3",),).toBe(false,);
  });

  test("drop-all rotation keeps only active file when maxFiles is 0", async () => {
    const dropPath = join(dir, "drop.log",);
    const t = new FileTransport({ path: dropPath, maxBytes: 10, maxFiles: 0, },);
    for (let i = 0; i < 5; i++) {
      await t.write(entry(20, `drop ${i}`,),);
    }
    const files = (await readdir(dir,)).filter((f,) => f.startsWith("drop.log",));
    expect(files,).toEqual(["drop.log",],);
  });

  test("write does not throw on error (silent catch)", async () => {
    const t = new FileTransport({ path: "/nonexistent-dir/x/y/app.log", },);
    expect(t.write(entry(20, "x",),),).resolves.toBeUndefined();
  });

  test("flush returns resolved promise", async () => {
    const t = new FileTransport({ path: logPath, },);
    expect(t.flush(),).resolves.toBeUndefined();
  });
});
