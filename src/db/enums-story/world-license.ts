// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── World Licensing (063) ──────────────────────────────────
/**
 * LicenseKind — how a `world_licenses` row states its terms: an SPDX
 * identifier (`spdx_or_custom='spdx'`) or free text
 * (`spdx_or_custom='custom'`). The two are mutually exclusive; the
 * `ck_world_licenses_payload` check constraint enforces which payload
 * column is populated.
 */
export const LicenseKind = {
  Spdx: "spdx",
  Custom: "custom",
} as const;
/** */
export type LicenseKind = (typeof LicenseKind)[keyof typeof LicenseKind];

/**
 * UseFlag — a shareability term. `allowed_use` grants a flag and
 * `prohibited_use` withholds it; an import that declares a withheld flag is
 * rejected by `validateImportLicense` (src/worlds/license.ts). Kept as a
 * closed set so both sides of that check stay comparable.
 */
export const UseFlag = {
  /** Reading and quoting the world's content. */
  View: "view",
  /** Running the world for personal, non-published use. */
  PrivateUse: "private_use",
  /** Publishing derivatives (forks, remixes) of the world. */
  Share: "share",
  /** Using the world in a commercial product. */
  Commercial: "commercial",
  /** Redistributing verbatim copies. */
  Redistribute: "redistribute",
  /** Using the world to train a model. */
  TrainModel: "train_model",
  /** Stripping or replacing the attribution block. */
  RemoveAttribution: "remove_attribution",
} as const;
/** */
export type UseFlag = (typeof UseFlag)[keyof typeof UseFlag];

// ── Maps (063) ────────────────────────────────────────────
/**
 * MapType — a map surface. Both are laid out on the same integer tile grid;
 * a `2d` map simply keeps every zone on `z = 0`, while `3d` maps layer zones
 * across `z`.
 */
export const MapType = {
  TwoD: "2d",
  ThreeD: "3d",
} as const;
/** */
export type MapType = (typeof MapType)[keyof typeof MapType];

/**
 * ZoneType — what a rectangular map region represents. `location`-kind zones
 * are the ones anchored to a fractal `locations.id`.
 */
export const ZoneType = {
  Region: "region",
  City: "city",
  District: "district",
  Building: "building",
  Dungeon: "dungeon",
  Wilderness: "wilderness",
  /** A zone anchored to a specific fractal location. */
  Location: "location",
} as const;
/** */
export type ZoneType = (typeof ZoneType)[keyof typeof ZoneType];
