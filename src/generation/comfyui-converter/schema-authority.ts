// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Stable identity and live-compatibility checks for pinned `/object_info`
 * snapshots. A pin is the sha256 of the canonically serialised snapshot;
 * live compatibility compares the captured class/input shape only.
 */
import { createHash, } from "node:crypto";
import { safeJsonStringify, } from "../../utils";
import type { ComfyUINodeInfo, } from "../providers/comfyui";
import type { ObjectInfoSnapshot, } from "./types";

/** Accepted digest shape: exactly 64 lowercase hex characters. */
const SHA256_HEX = /^[0-9a-f]{64}$/;

/** Optional digest prefix used elsewhere in the repo for hash references. */
const SHA256_PREFIX = "sha256:";

/** Confirm a deserialised value is a non-null object before field access. */
function isRecord(value: unknown,): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value,);
}

/** Collect live input names, rejecting a wrong-typed `input` or group. */
function liveInputNames(
  className: string,
  liveInput: unknown,
): { ok: true; names: Set<string> } | { ok: false; error: string } {
  if (!isRecord(liveInput,)) {
    return { ok: false, error: `Node "${className}" has a malformed input in /object_info`, };
  }

  const names = new Set<string>();
  for (const group of ["required", "optional",] as const) {
    const groupValue: unknown = liveInput[group];
    if (groupValue === undefined) { continue; }
    if (!isRecord(groupValue,)) {
      return { ok: false, error: `Node "${className}" has malformed ${group} inputs in /object_info`, };
    }

    for (const name of Object.keys(groupValue,)) { names.add(name,); }
  }

  return { ok: true, names, };
}

/** sha256 of `fixtures/object-info.json`, asserted by schema-authority.test.ts. */
export const PINNED_OBJECT_INFO_SHA256 = "732cbd98bdcdc1959974c90e4ad31e5731d0198d76f2ac31685d4ee562698f43";

/**
 * Read the bundled pinned snapshot.
 * @returns The `/object_info` fixture shipped with the converter
 * @throws {Error} When the fixture cannot be read or parsed
 */
export async function loadPinnedObjectInfo(): Promise<ObjectInfoSnapshot> {
  // TODO(env): bun-only `Bun.file(...).json()` — add a node shim when a node target lands.
  return await Bun.file(new URL("./fixtures/object-info.json", import.meta.url,),).json() as ObjectInfoSnapshot;
}

/**
 * Verify an operator-supplied digest against the bundled pin.
 * @param expectedSha256 - Digest from the bindings config
 * @returns The matching digest on success, otherwise a descriptive error
 */
export function verifyPinnedObjectInfoSha256(expectedSha256: string,): SchemaPinResult {
  try {
    const pinned = expectedSha256.trim();
    const raw = pinned.startsWith(SHA256_PREFIX,) ? pinned.slice(SHA256_PREFIX.length,) : pinned;
    const hex = raw.toLowerCase();
    if (!SHA256_HEX.test(hex,)) {
      return {
        ok: false,
        error:
          `Invalid schema pin "${expectedSha256}": expected 64 hex characters, optionally prefixed with "${SHA256_PREFIX}"`,
      };
    }

    if (hex !== PINNED_OBJECT_INFO_SHA256) {
      return { ok: false, error: `Schema pin mismatch: pinned ${hex}, bundled ${PINNED_OBJECT_INFO_SHA256}`, };
    }

    return { ok: true, sha256: hex, };
  } catch (error) {
    return {
      ok: false,
      error: `Schema pin verification failed: ${error instanceof Error ? error.message : String(error,)}`,
    };
  }
}

/**
 * Sort object keys recursively while keeping array order intact.
 *
 * @param value - any JSON-compatible value found inside a snapshot
 * @returns a copy with every object's keys sorted
 */
function canonicalize(value: unknown,): unknown {
  if (Array.isArray(value,)) {
    return value.map((item: unknown,) => canonicalize(item,));
  }

  if (value !== null && typeof value === "object") {
    const source = value as Readonly<Record<string, unknown>>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source,).sort()) {
      sorted[key] = canonicalize(source[key],);
    }

    return sorted;
  }

  return value;
}

/**
 * Deterministic JSON text for an `/object_info` snapshot.
 *
 * @param snapshot - pinned snapshot to serialise
 * @returns JSON with object keys sorted recursively; array order unchanged
 * @throws {TypeError} for cyclic or otherwise non-serialisable input
 */
export function objectInfoCanonicalJson(snapshot: ObjectInfoSnapshot,): string {
  const serialized = safeJsonStringify(canonicalize(snapshot,),);
  if (!serialized.ok) {
    throw new TypeError(serialized.error.message,);
  }

  return serialized.value;
}

/**
 * sha256 hex of {@link objectInfoCanonicalJson}.
 *
 * @param snapshot - pinned snapshot to hash
 * @returns 64 lowercase hex characters
 * @throws {TypeError} when the snapshot cannot be serialised
 */
export function objectInfoSha256(snapshot: ObjectInfoSnapshot,): string {
  return createHash("sha256",).update(objectInfoCanonicalJson(snapshot,), "utf8",).digest("hex",);
}

/**
 * Outcome of checking a snapshot against a pinned digest.
 * A discriminated union needs a type alias; each arm is still a plain object.
 */
export type SchemaPinResult = {
  readonly ok: true;
  readonly sha256: string;
} | {
  readonly ok: false;
  readonly error: string;
};

/**
 * Verify a snapshot against a pinned sha256 digest.
 *
 * Accepts a bare 64-hex digest or `sha256:<hex>`, case-insensitive, with
 * surrounding whitespace. Every failure is returned; nothing is thrown.
 *
 * @param snapshot - snapshot to verify
 * @param expectedSha256 - pinned digest, bare or `sha256:`-prefixed
 * @returns the matching digest on success, otherwise a descriptive error
 */
export function verifyObjectInfoPin(snapshot: ObjectInfoSnapshot, expectedSha256: string,): SchemaPinResult {
  try {
    const pinned = expectedSha256.trim();
    const raw = pinned.startsWith(SHA256_PREFIX,) ? pinned.slice(SHA256_PREFIX.length,) : pinned;
    const hex = raw.toLowerCase();
    if (!SHA256_HEX.test(hex,)) {
      return {
        ok: false,
        error:
          `Invalid schema pin "${expectedSha256}": expected 64 hex characters, optionally prefixed with "${SHA256_PREFIX}"`,
      };
    }

    const actual = objectInfoSha256(snapshot,);
    if (actual !== hex) {
      return { ok: false, error: `Schema pin mismatch: pinned ${hex}, computed ${actual}`, };
    }

    return { ok: true, sha256: actual, };
  } catch (error) {
    return {
      ok: false,
      error: `Schema pin verification failed: ${error instanceof Error ? error.message : String(error,)}`,
    };
  }
}

/**
 * Compare a live `/object_info` reply with the bundled pinned snapshot.
 * @param live - Live node-info map from the ComfyUI client
 * @param requiredNodes - Classes the uploaded workflow needs
 * @returns `{ ok: true }` or every compatibility error; never throws
 */
export async function verifyLiveSnapshot(
  live: Readonly<Record<string, ComfyUINodeInfo>>,
  requiredNodes: readonly string[],
): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  try {
    const pinned = await loadPinnedObjectInfo();
    return compareLiveNodeInfo(pinned, live, { requiredNodes, },);
  } catch (error) {
    return {
      ok: false,
      errors: [`Live schema check failed: ${error instanceof Error ? error.message : String(error,)}`,],
    };
  }
}

/** Classes that must be present and input-compatible in a live snapshot. */
export interface LiveSnapshotCheck {
  readonly requiredNodes: readonly string[];
}

/**
 * Check that a live `/object_info` still satisfies the pinned shape. Extra
 * live classes and inputs are fine; `input_order` is ignored because live
 * responses do not carry it. Every failure is returned; nothing is thrown.
 *
 * @param pinned - snapshot the pin was captured from
 * @param live - `ComfyUIClient.getNodeInfo()` response
 * @param options - classes that must survive the comparison
 * @returns `{ ok: true }` when compatible, otherwise all found errors
 */
export function compareLiveNodeInfo(
  pinned: ObjectInfoSnapshot,
  live: Readonly<Record<string, ComfyUINodeInfo>>,
  options: LiveSnapshotCheck,
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  try {
    for (const className of options.requiredNodes) {
      const liveNode: unknown = live[className];
      if (liveNode === undefined || liveNode === null) {
        errors.push(`Missing required node class "${className}" in live /object_info`,);
        continue;
      }

      if (!isRecord(liveNode,)) {
        errors.push(`Node "${className}" has a malformed /object_info entry`,);
        continue;
      }

      const pinnedNode = pinned[className];
      if (!pinnedNode) {
        continue;
      }

      const inputNames = liveInputNames(className, liveNode["input"],);
      if (!inputNames.ok) {
        errors.push(inputNames.error,);
        continue;
      }

      for (const group of ["required", "optional",] as const) {
        for (const name of Object.keys(pinnedNode.input?.[group] ?? {},)) {
          if (!inputNames.names.has(name,)) {
            errors.push(`Node "${className}" lost ${group} input "${name}" in live /object_info`,);
          }
        }
      }
    }
  } catch (error) {
    errors.push(`Live snapshot comparison failed: ${error instanceof Error ? error.message : String(error,)}`,);
  }

  return errors.length === 0 ? { ok: true, } : { ok: false, errors, };
}
