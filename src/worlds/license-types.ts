// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/worlds/license-types.ts — the shape contracts for world licensing.
 *
 * Split from ./license so the DB-facing service and the export/import
 * manifest can share the vocabulary without importing the service (which
 * pulls in Kysely). Mirrors the `character_licensing` precedent (001) —
 * the vocabulary is closed enums, never free strings.
 */
import type { LicenseKind, UseFlag, } from "../db/enums-story/world-license";

export type { LicenseKind, UseFlag, };

/** Attribution a reuser must reproduce when the license grants use. */
export interface Attribution {
  /** Human or org credited as author. */
  author?: string;
  /** Canonical URL for the world. */
  url?: string;
  /** Free-form notice line to display verbatim. */
  notice?: string;
}

/** A `world_licenses` row read back from the DB, with JSON decoded. */
export interface WorldLicense {
  worldId: string;
  kind: LicenseKind;
  /** SPDX identifier; set only when `kind` is `spdx`. */
  spdxId: string | null;
  /** Full license text; set only when `kind` is `custom`. */
  licenseText: string | null;
  attribution: Attribution;
  allowedUse: UseFlag[];
  prohibitedUse: UseFlag[];
}
/** The license fields a caller supplies to create or replace the row. */
export interface LicenseInput {
  /** SPDX identifier — required (and exclusive) when `kind` is `spdx`. */
  spdxId?: string | null;
  /** Free text — required (and exclusive) when `kind` is `custom`. */
  licenseText?: string | null;
  attribution?: Attribution;
  allowedUse?: UseFlag[];
  prohibitedUse?: UseFlag[];
}

/** Outcome of validating one license for import. */
export type ImportLicenseResult =
  | { ok: true }
  | { ok: false; violations: UseFlag[] };

/** Raised when a license payload is malformed (not a usable license). */
export class LicenseError extends Error {
  override readonly name = "LicenseError";
}

/** Raised when an import's declared use violates the world's license. */
export class LicenseViolationError extends Error {
  override readonly name = "LicenseViolationError";

  /**
   * @param violations the withheld use flags the importer declared
   */
  constructor(public readonly violations: UseFlag[],) {
    super(`Import declares prohibited use: ${violations.join(", ",)}`,);
  }
}

/**
 * SPDX identifier FORMAT, checked offline.
 *
 * SPDX ids are `[idstring]` plus optional `+` and `WITH` exception clauses:
 * `CC-BY-4.0`, `Apache-2.0`, `GPL-3.0-or-later`, `MIT`, `LGPL-3.0+`,
 * `GPL-2.0-only WITH Classpath-exception-2.0`. We deliberately validate
 * shape only — no runtime call to the external SPDX license list, so a
 * world stays importable offline and the check cannot go stale.
 */
const SPDX_EXPRESSION = /^[A-Za-z0-9][A-Za-z0-9.-]*(\+)?( WITH [A-Za-z0-9][A-Za-z0-9.-]*)?$/;

/**
 * Check whether `value` is a syntactically valid SPDX identifier.
 * @param value candidate identifier
 * @returns true when the string matches the SPDX expression grammar
 */
export function isValidSpdxId(value: string,): boolean {
  return SPDX_EXPRESSION.test(value.trim(),);
}

/** Minimum characters of free text accepted as a custom license. */
export const MIN_LICENSE_TEXT = 10;
