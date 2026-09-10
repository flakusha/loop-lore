// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for `ensureTlsCerts` — the self-signed development-cert bootstrap.
 *
 * The function:
 *   1. Returns the input paths verbatim if both `key` and `cert` files exist.
 *   2. Otherwise tries to spawn `openssl` (or `openssl.exe` on win32) to
 *      generate a self-signed cert into those paths.
 *   3. Returns `null` if no openssl binary is available, with a platform-
 *      specific install hint in the logs.
 *
 * We avoid spawning a real `openssl` process: tests override the global
 * `Bun.spawnSync` reference for the duration of the test so we can
 * simulate "first binary throws", "second binary succeeds", and "all
 * binaries throw".
 */

import { afterEach, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { createLogger, } from "../logger";
import { ensureTlsCerts, } from "./cert";

type SpawnSync = typeof Bun.spawnSync;

let originalSpawnSync: SpawnSync | undefined;
let tempDir = "";

beforeAll(() => {
  // getLogger() calls in ensureTlsCerts require a pre-initialized root logger.
  createLogger({ level: "error", },);
},);

beforeEach(() => {
  originalSpawnSync = Bun.spawnSync;
  tempDir = mkdtempSync(join(tmpdir(), "loop-lore-cert-test-",),);
},);

afterEach(() => {
  Bun.spawnSync = originalSpawnSync as SpawnSync;
  if (tempDir && existsSync(tempDir,)) {
    rmSync(tempDir, { recursive: true, force: true, },);
  }
},);

function writeCertFiles(keyPath: string, certPath: string,): void {
  mkdirSync(join(keyPath, "..",), { recursive: true, },);
  mkdirSync(join(certPath, "..",), { recursive: true, },);
  writeFileSync(keyPath, "fake-key",);
  writeFileSync(certPath, "fake-cert",);
}

describe("ensureTlsCerts — fast path", () => {
  test("returns the same TlsFiles when both key and cert already exist", () => {
    const keyPath = join(tempDir, "certs", "key.pem",);
    const certPath = join(tempDir, "certs", "cert.pem",);
    writeCertFiles(keyPath, certPath,);

    const result = ensureTlsCerts({ key: keyPath, cert: certPath, },);

    expect(result,).toEqual({ key: keyPath, cert: certPath, },);
  });

  test("does NOT invoke spawnSync when both files exist", () => {
    const keyPath = join(tempDir, "k",);
    const certPath = join(tempDir, "c",);
    writeCertFiles(keyPath, certPath,);

    let spawnCalled = false;
    Bun.spawnSync = ((..._args: unknown[]) => {
      spawnCalled = true;
      return { success: true, stdout: Buffer.from("",), stderr: Buffer.from("",), exitCode: 0, };
    }) as SpawnSync;

    ensureTlsCerts({ key: keyPath, cert: certPath, },);

    expect(spawnCalled,).toBe(false,);
  });
});

describe("ensureTlsCerts — generation path", () => {
  test("creates parent directories and returns paths when openssl succeeds", () => {
    const keyPath = join(tempDir, "new", "key.pem",);
    const certPath = join(tempDir, "new", "cert.pem",);

    Bun.spawnSync = ((cmd: unknown[],) => {
      // Verify it's the openssl invocation
      expect(cmd[0],).toBe("openssl",);
      expect(cmd,).toContain("-x509",);
      expect(cmd,).toContain("req",);
      // Simulate successful cert write
      writeFileSync(keyPath, "generated-key",);
      writeFileSync(certPath, "generated-cert",);
      return { success: true, stdout: Buffer.from("",), stderr: Buffer.from("",), exitCode: 0, };
    }) as SpawnSync;

    const result = ensureTlsCerts({ key: keyPath, cert: certPath, },);

    expect(result,).toEqual({ key: keyPath, cert: certPath, },);
    expect(existsSync(keyPath,),).toBe(true,);
    expect(existsSync(certPath,),).toBe(true,);
  });

  test("tries the next binary when the first one throws (only on win32 with two binaries)", () => {
    // POSIX has only one binary ("openssl"), so a throw goes straight to null.
    // Windows tries openssl.exe first, then openssl. The "second binary
    // succeeds" branch is therefore only reachable on win32.
    if (process.platform !== "win32") { return; }
    const keyPath = join(tempDir, "k2", "k.pem",);
    const certPath = join(tempDir, "k2", "c.pem",);

    let callIndex = 0;
    Bun.spawnSync = ((cmd: unknown[],) => {
      callIndex++;
      if (callIndex === 1) {
        throw new Error("binary not found",);
      }
      expect(cmd[0],).toBe("openssl",);
      writeFileSync(keyPath, "k",);
      writeFileSync(certPath, "c",);
      return { success: true, stdout: Buffer.from("",), stderr: Buffer.from("",), exitCode: 0, };
    }) as SpawnSync;

    const result = ensureTlsCerts({ key: keyPath, cert: certPath, },);

    expect(callIndex,).toBe(2,);
    expect(result,).toEqual({ key: keyPath, cert: certPath, },);
  });

  test("returns null when the only openssl binary fails (POSIX behavior)", () => {
    const keyPath = join(tempDir, "k3", "k.pem",);
    const certPath = join(tempDir, "k3", "c.pem",);

    Bun.spawnSync = (() => {
      return { success: false, stdout: Buffer.from("",), stderr: Buffer.from("err",), exitCode: 1, };
    }) as unknown as SpawnSync;

    const result = ensureTlsCerts({ key: keyPath, cert: certPath, },);

    expect(result,).toBeNull();
  });
});

describe("ensureTlsCerts — failure path", () => {
  test("returns null when every openssl binary throws", () => {
    const keyPath = join(tempDir, "fail", "k.pem",);
    const certPath = join(tempDir, "fail", "c.pem",);

    Bun.spawnSync = (() => {
      throw new Error("no openssl anywhere",);
    }) as unknown as SpawnSync;

    const result = ensureTlsCerts({ key: keyPath, cert: certPath, },);

    expect(result,).toBeNull();
  });

  test("does not throw when mkdirSync hits an already-present parent", () => {
    // Pre-create the parent so mkdirSync({recursive:true}) is a no-op
    mkdirSync(join(tempDir, "present",), { recursive: true, },);
    const keyPath = join(tempDir, "present", "k.pem",);
    const certPath = join(tempDir, "present", "c.pem",);

    Bun.spawnSync = ((_cmd: unknown[],) => {
      writeFileSync(keyPath, "k",);
      writeFileSync(certPath, "c",);
      return { success: true, stdout: Buffer.from("",), stderr: Buffer.from("",), exitCode: 0, };
    }) as SpawnSync;

    const result = ensureTlsCerts({ key: keyPath, cert: certPath, },);

    expect(result,).toEqual({ key: keyPath, cert: certPath, },);
  });
});
