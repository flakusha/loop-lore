// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression: the setup-state `tls` check resolves configured cert paths the
 * same way boot provisioning does — absolute operator paths verbatim, relative
 * / `${DATA_DIR}` placeholders re-anchored onto the runtime instance dir.
 * Each test owns a private state root and a unique instance: no fixed ports,
 * no shared globals, no ordering dependence, no cert generation.
 */
import { describe, expect, test, } from "bun:test";
import { randomUUID, } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { DATA_DIR, } from "../../config/constants";
import type { Config, } from "../../config/schema";
import { setupChecks, } from "./checks";

const ENV_STATE = "LOOP_LORE_STATE_DIR";
const ENV_INSTANCE = "LOOP_LORE_INSTANCE";
const MISSING_HINT = "TLS certificate files are missing.";

/** Minimal config with the shipped `${DATA_DIR}` placeholder paths. */
function placeholderConfig(): Config {
  return {
    server: { tls: { key: "${DATA_DIR}/certs/key.pem", cert: "${DATA_DIR}/certs/cert.pem", }, },
  } as unknown as Config;
}

/** Config with explicit absolute cert paths. */
function absoluteConfig(key: string, cert: string,): Config {
  return { server: { tls: { key, cert, }, }, } as unknown as Config;
}

/** The single `tls` entry from a full setupChecks run. */
async function tlsResult(config: Config,) {
  return (await setupChecks(config,)).find((check,) => check.id === "tls");
}

/** Write a key/cert pair into `certsDir` and return the two paths. */
function writeCerts(certsDir: string,): { key: string; cert: string } {
  mkdirSync(certsDir, { recursive: true, },);
  const key = join(certsDir, "key.pem",);
  const cert = join(certsDir, "cert.pem",);
  writeFileSync(key, "test-key",);
  writeFileSync(cert, "test-cert",);
  return { key, cert, };
}

/** Restore both env vars to their pre-test values. */
function restoreEnv(state: string | undefined, instance: string | undefined,): void {
  if (state === undefined) { delete process.env[ENV_STATE]; }
  else { process.env[ENV_STATE] = state; }

  if (instance === undefined) { delete process.env[ENV_INSTANCE]; }
  else { process.env[ENV_INSTANCE] = instance; }
}

describe("setup readiness tls check — cert path resolution", () => {
  test("certs in the runtime instance dir report ok", async () => {
    const root = mkdtempSync(join(tmpdir(), "ll-tls-check-",),);
    const instance = "tls-check-" + randomUUID();
    const savedState = process.env[ENV_STATE];
    const savedInstance = process.env[ENV_INSTANCE];
    try {
      writeCerts(join(root, instance, "certs",),);
      process.env[ENV_STATE] = root;
      process.env[ENV_INSTANCE] = instance;
      const tls = await tlsResult(placeholderConfig(),);
      expect(tls?.ok,).toBe(true,);
      expect(tls?.hint,).toBeUndefined();
    } finally {
      restoreEnv(savedState, savedInstance,);
      rmSync(root, { recursive: true, force: true, },);
    }
  });

  test("certs only under the frozen DATA_DIR are not picked up", async () => {
    const root = mkdtempSync(join(tmpdir(), "ll-tls-check-",),);
    const instance = "tls-check-" + randomUUID();
    const legacyDir = join(DATA_DIR, "certs",);
    const legacyKey = join(legacyDir, "key.pem",);
    const legacyCert = join(legacyDir, "cert.pem",);
    const savedState = process.env[ENV_STATE];
    const savedInstance = process.env[ENV_INSTANCE];
    const saved = new Map<string, Buffer>();
    const createdDir = !existsSync(legacyDir,);
    try {
      for (const file of [legacyKey, legacyCert,]) {
        if (existsSync(file,)) { saved.set(file, readFileSync(file,),); }
      }

      writeCerts(legacyDir,);
      process.env[ENV_STATE] = root;
      process.env[ENV_INSTANCE] = instance;
      const tls = await tlsResult(placeholderConfig(),);
      expect(tls?.ok,).toBe(false,);
      expect(tls?.hint,).toBe(MISSING_HINT,);
    } finally {
      restoreEnv(savedState, savedInstance,);
      for (const file of [legacyKey, legacyCert,]) {
        const previous = saved.get(file,);
        if (previous) { writeFileSync(file, previous,); }
        else { rmSync(file, { force: true, },); }
      }

      if (createdDir) { rmSync(legacyDir, { recursive: true, force: true, },); }
      rmSync(root, { recursive: true, force: true, },);
    }
  });

  test("explicit absolute paths inside this test root are used verbatim", async () => {
    const root = mkdtempSync(join(tmpdir(), "ll-tls-check-",),);
    const instance = "tls-check-" + randomUUID();
    const savedState = process.env[ENV_STATE];
    const savedInstance = process.env[ENV_INSTANCE];
    try {
      const { key, cert, } = writeCerts(join(root, "abs",),);
      process.env[ENV_STATE] = root;
      process.env[ENV_INSTANCE] = instance;
      const present = await tlsResult(absoluteConfig(key, cert,),);
      expect(present?.ok,).toBe(true,);

      const missing = await tlsResult(absoluteConfig(key, join(root, "abs", "missing.pem",),),);
      expect(missing?.ok,).toBe(false,);
      expect(missing?.hint,).toBe(MISSING_HINT,);
    } finally {
      restoreEnv(savedState, savedInstance,);
      rmSync(root, { recursive: true, force: true, },);
    }
  });
});
