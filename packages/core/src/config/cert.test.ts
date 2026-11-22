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

import { createLogger, } from "@/logger";
import { afterEach, beforeAll, beforeEach, describe, expect, spyOn, test, } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { isAbsolute, join, } from "node:path";
import { ensureTlsCerts, } from "./cert";
import { DATA_DIR, } from "./constants";
import { SERVER_DEFAULTS, } from "./sections/server";
import { resolveInstanceDir, } from "./state-dir";

type SpawnSync = typeof Bun.spawnSync;

const originalPlatform = process.platform;

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
  Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true, },);
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

describe("ensureTlsCerts — instance anchoring (F10)", () => {
  const ENV_STATE = "LOOP_LORE_STATE_DIR";
  const ENV_INSTANCE = "LOOP_LORE_INSTANCE";
  let savedState: string | undefined;
  let savedInstance: string | undefined;
  let stateRoot = "";

  beforeEach(() => {
    savedState = process.env[ENV_STATE];
    savedInstance = process.env[ENV_INSTANCE];
    stateRoot = mkdtempSync(join(tmpdir(), "loop-lore-cert-instance-",),);
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

  test("resolves relative cert paths inside the instance dir", () => {
    const keyPath = join(stateRoot, "alpha", "certs", "key.pem",);
    const certPath = join(stateRoot, "alpha", "certs", "cert.pem",);
    writeCertFiles(keyPath, certPath,);

    const result = ensureTlsCerts({ key: "certs/key.pem", cert: "certs/cert.pem", },);

    expect(result,).toEqual({ key: keyPath, cert: certPath, },);
  });

  test("does not depend on the process cwd", () => {
    const keyPath = join(stateRoot, "alpha", "certs", "key.pem",);
    const certPath = join(stateRoot, "alpha", "certs", "cert.pem",);
    writeCertFiles(keyPath, certPath,);

    const before = ensureTlsCerts({ key: "certs/key.pem", cert: "certs/cert.pem", },);
    const cwd = spyOn(process, "cwd",).mockReturnValue("/tmp/some-other-cwd",);
    try {
      expect(ensureTlsCerts({ key: "certs/key.pem", cert: "certs/cert.pem", },),).toEqual(before,);
    } finally {
      cwd.mockRestore();
    }
  });

  test("keeps absolute cert paths as-is", () => {
    const keyPath = join(tempDir, "abs", "key.pem",);
    const certPath = join(tempDir, "abs", "cert.pem",);
    writeCertFiles(keyPath, certPath,);

    expect(ensureTlsCerts({ key: keyPath, cert: certPath, },),).toEqual({ key: keyPath, cert: certPath, },);
  });

  test("honours an explicitly injected instance dir", () => {
    const injected = join(tempDir, "injected-instance",);
    const keyPath = join(injected, "certs", "key.pem",);
    const certPath = join(injected, "certs", "cert.pem",);
    writeCertFiles(keyPath, certPath,);

    expect(
      ensureTlsCerts({ key: "certs/key.pem", cert: "certs/cert.pem", }, { instanceDir: injected, },),
    ).toEqual({ key: keyPath, cert: certPath, },);
  });
});

describe("ensureTlsCerts — runtime instance dir (B1)", () => {
  const ENV_STATE = "LOOP_LORE_STATE_DIR";
  const ENV_INSTANCE = "LOOP_LORE_INSTANCE";
  const ENV_PORT = "PORT";
  let savedState: string | undefined;
  let savedInstance: string | undefined;
  let savedPort: string | undefined;
  let stateRoot = "";

  beforeEach(() => {
    savedState = process.env[ENV_STATE];
    savedInstance = process.env[ENV_INSTANCE];
    savedPort = process.env[ENV_PORT];
    stateRoot = mkdtempSync(join(tmpdir(), "loop-lore-b1-cert-",),);
    process.env[ENV_STATE] = stateRoot;
    delete process.env[ENV_INSTANCE];
    delete process.env[ENV_PORT];
  },);

  afterEach(() => {
    if (savedState === undefined) { delete process.env[ENV_STATE]; }
    else { process.env[ENV_STATE] = savedState; }

    if (savedInstance === undefined) { delete process.env[ENV_INSTANCE]; }
    else { process.env[ENV_INSTANCE] = savedInstance; }

    if (savedPort === undefined) { delete process.env[ENV_PORT]; }
    else { process.env[ENV_PORT] = savedPort; }

    rmSync(stateRoot, { recursive: true, force: true, },);
  },);

  test("unnamed instance on port 4000: certs are generated inside the runtime instance dir", () => {
    process.env[ENV_PORT] = "4000";
    const runtimeDir = resolveInstanceDir(process.env, { port: 4000, host: "localhost", },);
    const keyPath = join(runtimeDir, "certs", "key.pem",);
    const certPath = join(runtimeDir, "certs", "cert.pem",);
    let keyOut = "";
    let certOut = "";

    Bun.spawnSync = ((cmd: unknown[],) => {
      keyOut = cmd[cmd.indexOf("-keyout",) + 1] as string;
      certOut = cmd[cmd.indexOf("-out",) + 1] as string;
      writeFileSync(keyOut, "generated-key",);
      writeFileSync(certOut, "generated-cert",);
      return { success: true, stdout: Buffer.from("",), stderr: Buffer.from("",), exitCode: 0, };
    }) as SpawnSync;

    const result = ensureTlsCerts(SERVER_DEFAULTS.tls,);

    expect(result,).toEqual({ key: keyPath, cert: certPath, },);
    expect(keyOut,).toBe(keyPath,);
    expect(certOut,).toBe(certPath,);
  });

  test("named instance: certs stay in the named instance dir", () => {
    process.env[ENV_INSTANCE] = "alpha";
    const runtimeDir = resolveInstanceDir(process.env,);
    const keyPath = join(runtimeDir, "certs", "key.pem",);
    const certPath = join(runtimeDir, "certs", "cert.pem",);
    writeCertFiles(keyPath, certPath,);

    expect(ensureTlsCerts(SERVER_DEFAULTS.tls,),).toEqual({ key: keyPath, cert: certPath, },);
  });

  test("keeps custom absolute cert paths verbatim", () => {
    const keyPath = join(tempDir, "custom", "key.pem",);
    const certPath = join(tempDir, "custom", "cert.pem",);
    writeCertFiles(keyPath, certPath,);

    expect(ensureTlsCerts({ key: keyPath, cert: certPath, },),).toEqual({ key: keyPath, cert: certPath, },);
  });

  test("re-anchors a legacy absolute DATA_DIR cert path onto the runtime instance dir", () => {
    process.env[ENV_INSTANCE] = "alpha";
    const runtimeDir = resolveInstanceDir(process.env,);
    const keyPath = join(runtimeDir, "certs", "key.pem",);
    const certPath = join(runtimeDir, "certs", "cert.pem",);
    writeCertFiles(keyPath, certPath,);

    const legacy = { key: join(DATA_DIR, "certs", "key.pem",), cert: join(DATA_DIR, "certs", "cert.pem",), };
    expect(ensureTlsCerts(legacy,),).toEqual({ key: keyPath, cert: certPath, },);
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
      expect(cmd,).toContain("subjectAltName=DNS:localhost,IP:127.0.0.1",);
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

  test("returns the resolved absolute paths when a relative config is generated", () => {
    const keyPath = join(tempDir, "rel", "key.pem",);
    const certPath = join(tempDir, "rel", "cert.pem",);

    Bun.spawnSync = ((cmd: unknown[],) => {
      expect(cmd,).toContain("-keyout",);
      expect(cmd,).toContain(keyPath,);
      writeFileSync(keyPath, "generated-key",);
      writeFileSync(certPath, "generated-cert",);
      return { success: true, stdout: Buffer.from("",), stderr: Buffer.from("",), exitCode: 0, };
    }) as SpawnSync;

    const result = ensureTlsCerts({ key: "rel/key.pem", cert: "rel/cert.pem", }, { instanceDir: tempDir, },);

    // The caller loads these files — they must point at the generated certs,
    // not at the relative config strings.
    expect(result,).toEqual({ key: keyPath, cert: certPath, },);
    expect(isAbsolute(result?.key ?? "",),).toBe(true,);
    expect(isAbsolute(result?.cert ?? "",),).toBe(true,);
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

  test("throws a run-failure hint when the only openssl binary fails (POSIX)", () => {
    Object.defineProperty(process, "platform", { value: "linux", configurable: true, },);
    const keyPath = join(tempDir, "k3", "k.pem",);
    const certPath = join(tempDir, "k3", "c.pem",);
    const binaries: string[] = [];

    Bun.spawnSync = ((cmd: unknown[],) => {
      binaries.push(String(cmd[0],),);
      return { success: false, stdout: Buffer.from("",), stderr: Buffer.from("err",), exitCode: 1, };
    }) as unknown as SpawnSync;

    expect(() => ensureTlsCerts({ key: keyPath, cert: certPath, },)).toThrow(
      /OpenSSL ran but certificate generation failed \(tried: openssl \(failed\)\)\. Check the certificate paths and permissions/,
    );
    expect(binaries,).toEqual(["openssl",],);
  });
});

describe("ensureTlsCerts — failure path", () => {
  test("throws the platform install hint when every openssl binary is missing", () => {
    Object.defineProperty(process, "platform", { value: "linux", configurable: true, },);
    const keyPath = join(tempDir, "fail", "k.pem",);
    const certPath = join(tempDir, "fail", "c.pem",);

    Bun.spawnSync = (() => {
      throw Object.assign(new Error("binary not found",), { code: "ENOENT", },);
    }) as unknown as SpawnSync;

    expect(() => ensureTlsCerts({ key: keyPath, cert: certPath, },)).toThrow(
      /OpenSSL is not installed \(tried: openssl \(not found\)\)\. Install OpenSSL or configure certs manually\./,
    );
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

describe("ensureTlsCerts — OpenSSL classification", () => {
  test("tries openssl.exe then openssl on Windows and reports both missing", () => {
    Object.defineProperty(process, "platform", { value: "win32", configurable: true, },);
    const tried: string[] = [];
    Bun.spawnSync = ((cmd: unknown[],) => {
      tried.push(String(cmd[0],),);
      throw Object.assign(new Error("not found",), { code: "ENOENT", },);
    }) as unknown as SpawnSync;

    expect(() =>
      ensureTlsCerts({
        key: join(tempDir, "w", "k.pem",),
        cert: join(tempDir, "w", "c.pem",),
      },)
    ).toThrow(/slproweb\.com\/products\/Win32OpenSSL\.html/,);
    expect(tried,).toEqual(["openssl.exe", "openssl",],);
  });

  test("reports a run failure when the first Windows candidate is missing but the second fails", () => {
    Object.defineProperty(process, "platform", { value: "win32", configurable: true, },);
    let call = 0;
    Bun.spawnSync = ((cmd: unknown[],) => {
      call++;
      if (call === 1) {
        expect(cmd[0],).toBe("openssl.exe",);
        throw Object.assign(new Error("not found",), { code: "ENOENT", },);
      }
      expect(cmd[0],).toBe("openssl",);
      return { success: false, stdout: Buffer.from("",), stderr: Buffer.from("err",), exitCode: 1, };
    }) as unknown as SpawnSync;

    expect(() =>
      ensureTlsCerts({
        key: join(tempDir, "w2", "k.pem",),
        cert: join(tempDir, "w2", "c.pem",),
      },)
    ).toThrow(
      /OpenSSL ran but certificate generation failed \(tried: openssl\.exe \(not found\), openssl \(failed\)\)/,
    );
  });

  test("does not try a second POSIX candidate after a missing binary", () => {
    Object.defineProperty(process, "platform", { value: "linux", configurable: true, },);
    const tried: string[] = [];
    Bun.spawnSync = ((cmd: unknown[],) => {
      tried.push(String(cmd[0],),);
      throw Object.assign(new Error("not found",), { code: "ENOENT", },);
    }) as unknown as SpawnSync;

    expect(() =>
      ensureTlsCerts({
        key: join(tempDir, "p", "k.pem",),
        cert: join(tempDir, "p", "c.pem",),
      },)
    ).toThrow(/OpenSSL is not installed/,);
    expect(tried,).toEqual(["openssl",],);
  });

  test("existing cert files produce no OpenSSL attempt or error", () => {
    Object.defineProperty(process, "platform", { value: "win32", configurable: true, },);
    const keyPath = join(tempDir, "existing", "k.pem",);
    const certPath = join(tempDir, "existing", "c.pem",);
    writeCertFiles(keyPath, certPath,);
    let spawnCalled = false;
    Bun.spawnSync = (() => {
      spawnCalled = true;
      throw Object.assign(new Error("not found",), { code: "ENOENT", },);
    }) as unknown as SpawnSync;

    expect(ensureTlsCerts({ key: keyPath, cert: certPath, },),).toEqual({ key: keyPath, cert: certPath, },);
    expect(spawnCalled,).toBe(false,);
  });
});
