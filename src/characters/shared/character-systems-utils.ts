// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Field mapping constants for character systems export/import
// Eliminates 82 hardcoded field name pairs across exporter and importer

/** Licensing fields: [dbColumn, exportField] pairs */
export const LICENSING_FIELDS: [string, string,][] = [
  ["license_type", "licenseType",],
  ["custom_license_text", "customLicenseText",],
  ["attribution", "attribution",],
  ["allow_derivatives", "allowDerivatives",],
  ["allow_commercial", "allowCommercial",],
  ["share_alike", "shareAlike",],
];

/** Availability fields: [dbColumn, exportField] pairs */
export const AVAILABILITY_FIELDS: [string, string,][] = [
  ["status", "status",],
  ["usage_policy", "usagePolicy",],
  ["activity_restrictions", "activityRestrictions",],
  ["content_policy", "contentPolicy",],
  ["nsfw_policy", "nsfwPolicy",],
];

/** Trait fields: DB column names and export field names */
export const TRAIT_DB_COLUMNS = ["trait_category", "trait_name", "trait_value",] as const;
export const TRAIT_EXPORT_FIELDS = ["category", "name", "value",] as const;

/** Relationship export fields */
export const RELATIONSHIP_FIELDS = [
  "targetActorId",
  "relationshipType",
  "standing",
  "trust",
  "familiarity",
  "isBidirectional",
  "metadata",
] as const;

/** Avatar export fields */
export const AVATAR_FIELDS = [
  "assetId",
  "label",
  "tags",
  "isPrimary",
  "sortOrder",
] as const;

/** Convert DB row to export object using field map */
export function toExportFields(
  row: Record<string, unknown>,
  fieldMap: [string, string,][],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [dbCol, exportField,] of fieldMap) {
    result[exportField] = row[dbCol];
  }
  return result;
}

/** Convert export data to DB fields using field map */
export function toDbFields(
  data: Record<string, unknown>,
  fieldMap: [string, string,][],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [dbCol, exportField,] of fieldMap) {
    if (data[exportField] !== undefined) {
      result[dbCol] = data[exportField];
    }
  }
  return result;
}

/** Map a trait row to export format */
export function mapTraitForExport(
  trait: { trait_category: string; trait_name: string; trait_value: string },
): Record<string, unknown> {
  return {
    category: trait.trait_category,
    name: trait.trait_name,
    value: trait.trait_value,
  };
}

/** Map a relationship to export format */
export function mapRelationshipForExport(
  rel: {
    targetActorId: string;
    relationshipType: string;
    standing: number;
    trust: number;
    familiarity: number;
    isBidirectional: boolean;
    metadata: Record<string, unknown>;
  },
): Record<string, unknown> {
  return {
    targetActorId: rel.targetActorId,
    relationshipType: rel.relationshipType,
    standing: rel.standing,
    trust: rel.trust,
    familiarity: rel.familiarity,
    isBidirectional: rel.isBidirectional,
    metadata: rel.metadata,
  };
}

/** Map an avatar to export format */
export function mapAvatarForExport(
  avatar: {
    assetId: string;
    label: string;
    tags: Record<string, unknown>;
    isPrimary: boolean;
    sortOrder: number;
  },
): Record<string, unknown> {
  return {
    assetId: avatar.assetId,
    label: avatar.label,
    tags: avatar.tags,
    isPrimary: avatar.isPrimary,
    sortOrder: avatar.sortOrder,
  };
}

/** Error message helper (moved from importer) */
export function errMsg(error: unknown,): string {
  return error instanceof Error ? error.message : String(error,);
}
