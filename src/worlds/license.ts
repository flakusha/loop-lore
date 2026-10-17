// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/worlds/license.ts — world license + shareability (migration 063).
 *
 * One `world_licenses` row per world states whether the world is offered
 * under an SPDX identifier or custom text, who must be credited, and which
 * uses are granted vs withheld. The row travels with the export bundle
 * (`toLicenseManifest` / `applyLicenseOnImport`) so a shared world carries
 * its terms, and an import that declares a withheld use is refused.
 *
 * SPDX identifiers are checked for FORMAT only — no runtime lookup against
 * the external SPDX list, so validation stays offline and cannot go stale.
 */
import type { Kysely, Selectable, } from "kysely";
import type { LicenseKind, } from "../db/enums-story/world-license";
import { LicenseKind as LicenseKindValue, } from "../db/enums-story/world-license";
import type { DB, WorldLicenses, } from "../db/schema";
import { jsonParseOr, jsonStringifyOr, } from "../utils";
import {
  type Attribution,
  type ImportLicenseResult,
  isValidSpdxId,
  LicenseError,
  type LicenseInput,
  LicenseViolationError,
  MIN_LICENSE_TEXT,
  type UseFlag as UseFlagType,
  type WorldLicense,
} from "./license-types";
import { findWorld, } from "./lookup";

// Re-exported so callers have one import site for the license surface; the
// bundle half lives in ./license-bundle and re-exports the same vocabulary.
export {
  type Attribution,
  type ImportLicenseResult,
  isValidSpdxId,
  LicenseError,
  type LicenseInput,
  LicenseViolationError,
  MIN_LICENSE_TEXT,
  type UseFlagType as UseFlag,
  type WorldLicense,
};
export {
  applyLicenseOnImport,
  assertImportAllowed,
  type LicensedBundle,
  type LicenseManifest,
  toLicenseManifest,
  USE_FLAGS,
  validateImportLicense,
} from "./license-bundle";

/** Raw `world_licenses` row, JSON columns still encoded. */
export type WorldLicenseRow = Selectable<WorldLicenses>;

/** Render an instant as SQLite `datetime('now')`-style text. */
function sqlStamp(now: Date,): string {
  return now.toISOString().slice(0, 19,).replace("T", " ",);
}

/**
 * Determine which of the two license payloads the input supplies.
 * Exactly one may be present; supplying both or neither is a `LicenseError`.
 * @param input caller-supplied license fields
 * @returns the discriminator to persist
 * @throws {LicenseError} when the input is neither valid SPDX nor custom text
 */
export function resolveLicenseKind(input: LicenseInput,): LicenseKind {
  const spdx = input.spdxId?.trim() ?? "";
  const text = input.licenseText?.trim() ?? "";

  if (spdx !== "" && text !== "") {
    throw new LicenseError("Provide an SPDX id or custom license text, not both",);
  }

  if (spdx !== "") {
    if (!isValidSpdxId(spdx,)) { throw new LicenseError(`Malformed SPDX identifier: ${spdx}`,); }
    return LicenseKindValue.Spdx;
  }

  if (text !== "") {
    if (text.length < MIN_LICENSE_TEXT) {
      throw new LicenseError(`Custom license text must be at least ${MIN_LICENSE_TEXT} characters`,);
    }

    return LicenseKindValue.Custom;
  }

  throw new LicenseError("A license needs either an SPDX id or custom license text",);
}

/**
 * Create or replace the world's license.
 * @param db Kysely handle
 * @param worldId the world to license
 * @param input SPDX id or custom text plus attribution and use flags
 * @returns the persisted license, JSON decoded
 * @throws {LicenseError} for an unknown world or a malformed license
 */
export async function setWorldLicense(
  db: Kysely<DB>,
  worldId: string,
  input: LicenseInput,
): Promise<WorldLicense> {
  const kind = resolveLicenseKind(input,);

  if (!(await findWorld(db, worldId,))) { throw new LicenseError(`World not found: ${worldId}`,); }

  const values = {
    spdx_or_custom: kind,
    spdx_id: kind === LicenseKindValue.Spdx ? input.spdxId!.trim() : null,
    license_text: kind === LicenseKindValue.Custom ? input.licenseText!.trim() : null,
    attribution: jsonStringifyOr(input.attribution ?? {},),
    allowed_use: jsonStringifyOr(input.allowedUse ?? [],),
    prohibited_use: jsonStringifyOr(input.prohibitedUse ?? [],),
    updated_at: sqlStamp(new Date(),),
  };

  await db.insertInto("world_licenses",).values({ world_id: worldId, ...values, },)
    .onConflict((oc,) => oc.column("world_id",).doUpdateSet(values,))
    .execute();

  const license = await getWorldLicense(db, worldId,);
  if (!license) { throw new LicenseError(`License write failed for world ${worldId}`,); }
  return license;
}

/**
 * Read a world's license.
 * @param db Kysely handle
 * @param worldId the world to read
 * @returns the license with JSON decoded, or null when the world is unlicensed
 */
export async function getWorldLicense(db: Kysely<DB>, worldId: string,): Promise<WorldLicense | null> {
  const row = await db.selectFrom("world_licenses",).selectAll().where("world_id", "=", worldId,)
    .executeTakeFirst();

  return row ? decodeLicense(row,) : null;
}

/**
 * Decode a raw row's JSON columns into the domain shape.
 * @param row raw `world_licenses` row
 * @returns the decoded license
 */
function decodeLicense(row: WorldLicenseRow,): WorldLicense {
  return {
    worldId: row.world_id,
    kind: row.spdx_or_custom,
    spdxId: row.spdx_id,
    licenseText: row.license_text,
    attribution: jsonParseOr<Attribution>(row.attribution, {},),
    allowedUse: jsonParseOr<UseFlagType[]>(row.allowed_use, [],),
    prohibitedUse: jsonParseOr<UseFlagType[]>(row.prohibited_use, [],),
  };
}
