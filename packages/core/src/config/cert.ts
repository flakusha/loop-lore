// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Self-signed TLS certificate generation.
 *
 * On first run (or when cert files are missing), generates ephemeral
 * development certificates using OpenSSL. Throws a classified error when
 * provisioning fails so boot can fail closed with an actionable message.
 *
 * Certificates are valid for 365 days and stored at the configured paths.
 */

import { getLogger, } from "@/logger";
import { chmodSync, existsSync, mkdirSync, } from "node:fs";
import { dirname, } from "node:path";
import { resolveInstancePath, } from "./instance-path";
import type { TlsConfig, } from "./schema";
import { resolveInstanceDir, } from "./state-dir";

/** */
export type TlsFiles = TlsConfig;

let tlsLog: ReturnType<ReturnType<typeof getLogger>["child"]> | null = null;

/** */
function getTlsLog(): ReturnType<ReturnType<typeof getLogger>["child"]> {
  tlsLog ??= getLogger().child({ module: "tls", },);
  return tlsLog;
}

/** Options for {@link ensureTlsCerts}. */
export interface EnsureTlsCertsOptions {
  /**
   * Instance dir relative cert paths resolve against. Defaults to this
   * instance's state dir.
   */
  instanceDir?: string;
}

/**
 * Restrict a freshly generated private key. The reuse fast path never calls
 * this, so pre-existing key modes are left untouched. POSIX enforces 0600;
 * Windows chmod only toggles the read-only bit, so failure there is best-effort.
 */
function restrictGeneratedKeyMode(keyPath: string,): void {
  try {
    chmodSync(keyPath, 0o600,);
  } catch (error) {
    if (process.platform !== "win32") {
      throw error;
    }
    getTlsLog().warn("Could not restrict generated TLS key permissions (best effort on Windows)",);
  }
}

/**
 * Ensure TLS key + cert exist. Auto-generates self-signed if missing.
 * Relative paths resolve against the instance dir — never the process cwd, so
 * the cert location does not depend on where the app was launched. A path
 * anchored at the import-frozen DATA_DIR (the shipped default) is re-anchored
 * onto the runtime instance dir; every other absolute path wins as-is.
 * @param configPath
 * @param opts
 * @throws Error when provisioning fails, with the reason and platform hint.
 */
export function ensureTlsCerts(configPath: TlsFiles, opts?: EnsureTlsCertsOptions,): TlsFiles | null {
  const base = opts?.instanceDir ?? resolveInstanceDir(process.env,);
  const resolved: TlsFiles = {
    key: resolveInstancePath(configPath.key, { instanceDir: base, },),
    cert: resolveInstancePath(configPath.cert, { instanceDir: base, },),
  };

  // Both exist — use as-is
  if (existsSync(resolved.key,) && existsSync(resolved.cert,)) {
    return resolved;
  }

  // Ensure parent directory exists
  mkdirSync(dirname(resolved.key,), { recursive: true, },);
  mkdirSync(dirname(resolved.cert,), { recursive: true, },);

  // Generate self-signed cert
  getTlsLog().info("Generating self-signed development certificate...",);

  // On Windows, try openssl.exe as well. Read process.platform directly: the
  // node:process named import is a static copy, so stubbing process.platform
  // in tests would not change the candidate list.
  const opensslBin = process.platform === "win32" ? ["openssl.exe", "openssl",] : ["openssl",];

  type Attempt = { bin: string; missing: boolean };
  const attempts: Attempt[] = [];

  for (const bin of opensslBin) {
    // TODO(env): bun-only — Bun.spawnSync is a Bun API; add a node child_process shim when a node target lands.
    try {
      const result = Bun.spawnSync([
        bin,
        "req",
        "-x509",
        "-nodes",
        "-days",
        "365",
        "-newkey",
        "rsa:2048",
        "-keyout",
        resolved.key,
        "-out",
        resolved.cert,
        "-subj",
        "/C=XX/ST=Development/L=Local/O=loop-lore/CN=localhost",
        "-addext",
        "subjectAltName=DNS:localhost,IP:127.0.0.1",
      ],);

      if (result.success) {
        restrictGeneratedKeyMode(resolved.key,);
        getTlsLog().info(`Certificate generated: ${resolved.cert}`,);
        // The RESOLVED paths: the caller loads these files (Bun.file), and a
        // relative config path would resolve against the cwd, not the
        // instance dir the cert was just written to.
        return resolved;
      }

      attempts.push({ bin, missing: false, },);
    } catch (error) {
      attempts.push({
        bin,
        missing: (error as NodeJS.ErrnoException | undefined)?.code === "ENOENT",
      },);
    }
  }

  const platformHint = process.platform === "win32"
    ? "Install OpenSSL for Windows (https://slproweb.com/products/Win32OpenSSL.html) or configure certs manually."
    : "Install OpenSSL or configure certs manually.";

  const tried = attempts.map(({ bin, missing, },) => `${bin} (${missing ? "not found" : "failed"})`).join(", ",);
  const detail = attempts.some(({ missing, },) => !missing)
    ? `OpenSSL ran but certificate generation failed (tried: ${tried}). Check the certificate paths and permissions, or configure certs manually.`
    : `OpenSSL is not installed (tried: ${tried}). ${platformHint}`;

  throw new Error(`TLS certificate generation failed. ${detail}`,);
}
