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

export type TlsFiles = TlsConfig;

function certLog() {
  return getLogger().child({ module: "tls" });
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
  certLog().info("Generating self-signed development certificate...");

  const subject = "/C=XX/ST=Development/L=Local/O=loop-lore/CN=localhost";
  const result = Bun.spawnSync([
    "openssl",
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
    subject,
  ]);

  if (!result.success) {
    const message = result.stderr.toString().trim() || "unknown error";
    certLog().warn(`Failed to generate certificate: ${message}`);
    certLog().warn("Falling back to HTTP only. Install openssl or configure certs manually.");
    return null;
  }

  certLog().info(`Certificate generated: ${configPath.cert}`);
  return configPath;
}
