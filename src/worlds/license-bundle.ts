// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/worlds/license-bundle.ts — the export/import face of world licensing.
 *
 * Split from ./license: the DB CRUD and the bundle round-trip are separate
 * contracts, and this half is the only part the export/import pipeline needs.
 * A world bundle carries its license as a manifest so a shared world travels
 * with its terms, and an import that declares a withheld use is refused
 * before the world is adopted.
 */
import type { Kysely, } from "kysely";
import type { LicenseKind, } from "../db/enums-story/world-license";
import { LicenseKind as LicenseKindValue, UseFlag, } from "../db/enums-story/world-license";
import type { DB, } from "../db/schema";
import { setWorldLicense, } from "./license";
import type {
  Attribution,
  ImportLicenseResult,
  LicenseInput,
  UseFlag as UseFlagType,
  WorldLicense,
} from "./license-types";
import { isValidSpdxId, LicenseError, LicenseViolationError, } from "./license-types";

/** The license block embedded in an export bundle. */
export interface LicenseManifest {
  world_id: string;
  spdx_or_custom: LicenseKind;
  spdx_id: string | null;
  license_text: string | null;
  attribution: Attribution;
  allowed_use: UseFlagType[];
  prohibited_use: UseFlagType[];
}

/** A bundle carrying a world plus its license, as export/import round-trips. */
export interface LicensedBundle {
  /** The bundle's world id; the license is written against this world. */
  worldId: string;
  /** Optional manifest produced by {@link toLicenseManifest}. */
  license?: LicenseManifest | null;
}

/** Every use flag the vocabulary defines, in declaration order. */
export const USE_FLAGS = Object.values(UseFlag,) as UseFlagType[];

/**
 * Check whether a declared use is permitted by the license.
 *
 * A use is refused when it appears in `prohibitedUse` OR when it was never
 * granted in `allowedUse`. That second half matters: a license granting only
 * a subset must not be read as "everything else is free".
 * @param license the license in force
 * @param declaredProhibitedUse the uses the importer intends to make
 * @returns `{ ok: true }`, or `{ ok: false, violations }` listing each refusal
 */
export function validateImportLicense(
  { license, declaredProhibitedUse, }: { license: WorldLicense; declaredProhibitedUse: UseFlagType[] },
): ImportLicenseResult {
  const withheld = new Set(license.prohibitedUse,);
  const granted = new Set(license.allowedUse,);
  const violations = declaredProhibitedUse.filter((flag,) => withheld.has(flag,) || !granted.has(flag,));

  return violations.length === 0 ? { ok: true, } : { ok: false, violations, };
}

/**
 * Project a license into the export bundle's manifest block.
 * @param license the license to publish
 * @returns the bundle-shaped manifest
 */
export function toLicenseManifest({ license, }: { license: WorldLicense },): LicenseManifest {
  return {
    world_id: license.worldId,
    spdx_or_custom: license.kind,
    spdx_id: license.spdxId,
    license_text: license.licenseText,
    attribution: license.attribution,
    allowed_use: license.allowedUse,
    prohibited_use: license.prohibitedUse,
  };
}

/**
 * Write a bundle's license onto its target world, refusing a violating import.
 *
 * The world is written BEFORE the violation check so the offending import
 * still leaves a copy of the terms it broke on record; the throw is what
 * stops the import from being reported as successful.
 * @param options.db Kysely handle
 * @param options.bundle the bundle being imported, carrying its license manifest
 * @param options.declaredProhibitedUse uses the importer intends to make
 * @returns the applied license, or null when the bundle carries none
 * @throws {LicenseError} when the manifest is malformed
 * @throws {LicenseViolationError} when the import declares a withheld use
 */
export async function applyLicenseOnImport(
  { db, bundle, declaredProhibitedUse = [], }: {
    db: Kysely<DB>;
    bundle: LicensedBundle;
    declaredProhibitedUse?: UseFlagType[];
  },
): Promise<WorldLicense | null> {
  const manifest = bundle.license;
  if (!manifest) { return null; }

  const kind = manifest.spdx_or_custom;
  const spdxId = manifest.spdx_id?.trim() ?? "";
  const licenseText = manifest.license_text?.trim() ?? "";
  if (kind === LicenseKindValue.Spdx && !isValidSpdxId(spdxId,)) {
    throw new LicenseError(`Malformed SPDX identifier in bundle: ${spdxId}`,);
  }

  const input: LicenseInput = {
    spdxId: kind === LicenseKindValue.Spdx ? spdxId : null,
    licenseText: kind === LicenseKindValue.Custom ? licenseText : null,
    attribution: manifest.attribution,
    allowedUse: manifest.allowed_use,
    prohibitedUse: manifest.prohibited_use,
  };

  const license = await setWorldLicense(db, bundle.worldId, input,);
  assertImportAllowed(license, declaredProhibitedUse,);
  return license;
}

/**
 * Assert an import may proceed, throwing when any declared use is withheld.
 * @param license the license in force
 * @param declaredProhibitedUse the uses the importer intends to make
 * @throws {LicenseViolationError} when any declared use is refused
 */
export function assertImportAllowed(
  license: WorldLicense,
  declaredProhibitedUse: UseFlagType[],
): void {
  const result = validateImportLicense({ license, declaredProhibitedUse, },);
  if (!result.ok) { throw new LicenseViolationError(result.violations,); }
}
