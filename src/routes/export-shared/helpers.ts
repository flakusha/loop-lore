import crypto from "node:crypto";
import { safeJsonStringify, } from "../../utils";

/**
 * Pretty-print a JSON value (2-space indent) safely, mirroring the previous
 * `JSON.stringify(value, null, 2)` calls. Never throws.
 */
export function prettyJson(value: unknown,): string {
  const sr = safeJsonStringify(value, 2,);
  return sr.ok ? sr.value : "{}";
}

/**
 * Record a `sha256:` prefixed checksum for a written export artifact.
 * Shared by both export handlers for routine, metadata, and manifest entries.
 */
export function addChecksum(
  checksums: Record<string, string>,
  path: string,
  content: string | Buffer,
): void {
  checksums[path] = `sha256:${crypto.createHash("sha256",).update(content,).digest("hex",)}`;
}
