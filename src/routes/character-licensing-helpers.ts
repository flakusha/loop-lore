// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { LicenseType, } from "../db/enums";
import type { DB, } from "../db/schema";

/** Effective licensing values recorded in the audit history. */
export interface LicenseHistoryRow {
  license_type: string;
  custom_license_text: string | null;
  attribution: string | null;
  allow_derivatives: number;
  allow_commercial: number;
  share_alike: number;
}

/**
 * Convert boolean to 0/1 integer, with fallback for undefined.
 * @param value
 * @param fallback
 */
export function booleanToInt(value: boolean | undefined, fallback: number,): number {
  return value === undefined ? fallback : (value ? 1 : 0);
}

/**
 * Compose a `LicenseHistoryRow` (with typed `license_type`) from a license
 * POST body + an optional existing row. Unspecified fields fall back to
 * the existing values (or to the supplied defaults when no row exists).
 * @param existing
 * @param body
 */
export function composeLicenseRow(
  existing: {
    license_type: string;
    custom_license_text: string | null;
    attribution: string | null;
    allow_derivatives: number;
    allow_commercial: number;
    share_alike: number;
  } | undefined,
  body: {
    license_type?: LicenseType;
    custom_license_text?: string | null;
    attribution?: string | null;
    allow_derivatives?: boolean;
    allow_commercial?: boolean;
    share_alike?: boolean;
  },
): LicenseHistoryRow & { license_type: LicenseType } {
  if (existing) {
    return {
      license_type: body.license_type ?? (existing.license_type as LicenseType),
      custom_license_text: body.custom_license_text ?? existing.custom_license_text,
      attribution: body.attribution ?? existing.attribution,
      allow_derivatives: booleanToInt(body.allow_derivatives, existing.allow_derivatives,),
      allow_commercial: booleanToInt(body.allow_commercial, existing.allow_commercial,),
      share_alike: booleanToInt(body.share_alike, existing.share_alike,),
    };
  }
  return {
    license_type: body.license_type ?? "proprietary",
    custom_license_text: body.custom_license_text ?? null,
    attribution: body.attribution ?? null,
    allow_derivatives: booleanToInt(body.allow_derivatives, 1,),
    allow_commercial: booleanToInt(body.allow_commercial, 0,),
    share_alike: booleanToInt(body.share_alike, 0,),
  };
}

/**
 * Record a licensing change in the audit history (TASK-030).
 * @param database
 * @param actorId
 * @param row
 * @param changedBy
 */
export async function recordLicenseHistory(
  database: Kysely<DB>,
  actorId: string,
  row: LicenseHistoryRow,
  changedBy: string,
): Promise<void> {
  await database
    .insertInto("character_license_history",)
    .values({
      id: crypto.randomUUID(),
      actor_id: actorId,
      ...row,
      changed_by: changedBy,
    },)
    .execute();
}
