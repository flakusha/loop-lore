/**
 * Self-signed TLS certificate generation.
 *
 * On first run (or when cert files are missing), generates ephemeral
 * development certificates using OpenSSL. Falls back gracefully if
 * OpenSSL is not available — HTTP-only operation continues.
 *
 * Certificates are valid for 365 days and stored at the configured paths.
 */

import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getLogger } from "../logger";
import type { TlsConfig } from "./schema";
import { platform } from "node:process";

export type TlsFiles = TlsConfig;

let tlsLog: ReturnType<ReturnType<typeof getLogger>["child"]> | null = null;

function getTlsLog(): ReturnType<ReturnType<typeof getLogger>["child"]> {
  tlsLog ??= getLogger().child({ module: "tls" });
  return tlsLog;
}

/**
 * Ensure TLS key + cert exist. Auto-generates self-signed if missing.
 *
 * @returns TlsFiles paths if available, null if TLS is unavailable.
 */
export function ensureTlsCerts(configPath: TlsFiles): TlsFiles | null {
  // Both exist — use as-is
  if (existsSync(configPath.key) && existsSync(configPath.cert)) {
    return configPath;
  }

  // Ensure parent directory exists
  mkdirSync(dirname(configPath.key), { recursive: true });
  mkdirSync(dirname(configPath.cert), { recursive: true });

  // Generate self-signed cert
  getTlsLog().info("Generating self-signed development certificate...");

  // On Windows, try openssl.exe as well
  const opensslBin = platform === "win32" ? ["openssl.exe", "openssl"] : ["openssl"];

  for (const bin of opensslBin) {
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
        configPath.key,
        "-out",
        configPath.cert,
        "-subj",
        "/C=XX/ST=Development/L=Local/O=loop-lore/CN=localhost",
      ]);

      if (result.success) {
        getTlsLog().info(`Certificate generated: ${configPath.cert}`);
        return configPath;
      }
    } catch {
      // Try next binary
    }
  }

  const platformHint =
    platform === "win32"
      ? "Install OpenSSL for Windows (https://slproweb.com/products/Win32OpenSSL.html) or configure certs manually."
      : "Install OpenSSL or configure certs manually.";

  getTlsLog().warn(`Failed to generate certificate. ${platformHint}`);
  getTlsLog().warn("Falling back to HTTP only.");

  return null;
}
