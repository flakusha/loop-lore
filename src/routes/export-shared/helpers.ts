// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// lean-ctx: Bun.CryptoHasher("sha256") emits byte-identical output to
//          node:crypto.createHash("sha256") (verified against the previous
//          implementation on test vectors like "hello-token-1" →
//          7961a7f6...). Existing checksums in the wild remain valid.
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
  checksums[path] = `sha256:${new Bun.CryptoHasher("sha256",).update(content,).digest("hex",)}`;
}
