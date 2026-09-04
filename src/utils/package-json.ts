// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { readFileSync, writeFileSync, } from "node:fs";
import { safeJsonParse, safeJsonStringify, } from "./safe-json";

/**
 * Read-only and writeable accessors for `package.json`.
 *
 * The READ path (`readPackageJsonOrNull`) returns `null` on missing /
 * malformed input. This is appropriate for callers that want to fall back
 * to a default version or skip the operation entirely — e.g. version
 * prediction during feature-branch releases where a missing `package.json`
 * should not crash the script.
 *
 * The WRITE path (`setPackageJsonVersion`) throws on missing / malformed
 * input. Silently overwriting a real `package.json` with `{ "version": "…" }`
 * is data loss: it destroys `name`, `scripts`, `dependencies`, `license`,
 * and every other field. Throwing surfaces the corrupt state instead.
 *
 * History: commit `5eb777fb` conflated the two paths with a single lenient
 * helper, which caused release-time scripts to silently clobber packages.
 * This module re-establishes the asymmetry.
 */

export type PackageJson = { version?: string } & Record<string, unknown>;

export type PackageJsonReadResult =
  | { ok: true; value: PackageJson }
  | { ok: false; error: Error };

/**
 * Read + parse a `package.json` safely. Never throws.
 * @param packageJsonPath
 */
export function readPackageJson(packageJsonPath: string,): PackageJsonReadResult {
  let text: string;
  try {
    text = readFileSync(packageJsonPath, "utf-8",);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error : new Error(String(error,),),
    };
  }
  return safeJsonParse<PackageJson>(text,);
}

/**
 * Read-only fetch helper. Returns `null` on missing/unparseable input.
 * @param packageJsonPath
 */
export function readPackageJsonOrNull(packageJsonPath: string,): PackageJson | null {
  const result = readPackageJson(packageJsonPath,);
  return result.ok ? result.value : null;
}

/**
 * Read + write `package.json` with the new version applied. Throws on
 * missing or malformed input so a corrupt `package.json` surfaces loudly.
 * @param packageJsonPath
 * @param version
 */
export function setPackageJsonVersion(packageJsonPath: string, version: string,): void {
  const result = readPackageJson(packageJsonPath,);
  if (!result.ok) {
    const code = (result.error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new Error(`Missing package.json at ${packageJsonPath}`,);
    }
    throw new Error(
      `Cannot read package.json at ${packageJsonPath}: ${result.error.message}`,
    );
  }
  result.value.version = version;
  const serialized = safeJsonStringify(result.value, 2,);
  if (!serialized.ok) {
    throw new Error(
      `Cannot serialize package.json at ${packageJsonPath}: ${serialized.error.message}`,
    );
  }
  writeFileSync(packageJsonPath, `${serialized.value}\n`,);
}
