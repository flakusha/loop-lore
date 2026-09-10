// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Asset transform service — per-context framing metadata (crop, zoom,
 * rotation, focal point) stored as data, never baked pixels.
 *
 * Resolution precedence: explicit `context` row → `default` row → undefined
 * (caller falls back to CSS defaults). One source image serves every render
 * context; `sprite` context feeds VN stage compositing.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { TransformContext, } from "../../db/enums";
import { upsertByUnique, } from "../../db/upsert-helpers";
import type { AssetTransforms, } from "../../db/schema-core";

export type { AssetTransforms, };

/** Normalized framing values: crop/focal in 0..1, zoom > 0, rotation degrees. */
export interface TransformValues {
  cropX?: number | null;
  cropY?: number | null;
  cropW?: number | null;
  cropH?: number | null;
  zoom?: number | null;
  rotation?: number | null;
  focalPointX?: number | null;
  focalPointY?: number | null;
}

/**
 * Heuristic seed focal point for freshly stored images: horizontal center,
 * upper third — where portrait heads land in generated/standing-figure
 * framing. Manual placement always overrides; a real face detector can
 * replace this seed later without schema changes.
 */
export const SEED_FOCAL_POINT = { x: 0.5, y: 0.35, } as const;

/**
 * @param values
 */
function assertValidTransform(values: TransformValues,): void {
  for (const [key, value,] of Object.entries(values,)) {
    if (value === undefined || value === null) { continue; }
    if (!Number.isFinite(value,)) { throw new Error(`Invalid transform: ${key} must be finite`,); }
    if (key === "zoom" && value <= 0) { throw new Error("Invalid transform: zoom must be > 0",); }
    if (key !== "zoom" && key !== "rotation" && (value < 0 || value > 1)) {
      throw new Error(`Invalid transform: ${key} must be within 0..1`,);
    }
  }
}

/**
 * Idempotent upsert of one (asset, context) transform row.
 * @param db
 * @param assetId
 * @param context
 * @param values
 */
export async function upsertAssetTransform(
  db: Kysely<DB>,
  assetId: string,
  context: TransformContext,
  values: TransformValues,
): Promise<AssetTransforms> {
  assertValidTransform(values,);
  await upsertByUnique(db, "asset_transforms", {
    asset_id: assetId,
    context,
    crop_x: values.cropX ?? null,
    crop_y: values.cropY ?? null,
    crop_w: values.cropW ?? null,
    crop_h: values.cropH ?? null,
    zoom: values.zoom ?? null,
    rotation: values.rotation ?? null,
    focal_point_x: values.focalPointX ?? null,
    focal_point_y: values.focalPointY ?? null,
    updated_at: new Date().toISOString(),
  }, ["asset_id", "context",],);
  const row = await getAssetTransform(db, assetId, context,);
  if (!row) { throw new Error("Transform upsert did not persist",); }
  return row;
}

/**
 * Read one (asset, context) transform row.
 * @param db
 * @param assetId
 * @param context
 */
export async function getAssetTransform(
  db: Kysely<DB>,
  assetId: string,
  context: TransformContext,
): Promise<AssetTransforms | undefined> {
  return db.selectFrom("asset_transforms",).selectAll()
    .where("asset_id", "=", assetId,).where("context", "=", context,)
    .executeTakeFirst();
}

/**
 * Resolve the effective transform: context row, else default row.
 * @param db
 * @param assetId
 * @param context
 */
export async function resolveAssetTransform(
  db: Kysely<DB>,
  assetId: string,
  context: TransformContext,
): Promise<AssetTransforms | undefined> {
  return (await getAssetTransform(db, assetId, context,))
    ?? (context === TransformContext.Default
      ? undefined
      : await getAssetTransform(db, assetId, TransformContext.Default,));
}

/**
 * Seed the default-context row for a fresh image when none exists.
 * @param db
 * @param assetId
 */
export async function seedBaseTransform(db: Kysely<DB>, assetId: string,): Promise<void> {
  if (await getAssetTransform(db, assetId, TransformContext.Default,)) { return; }
  await upsertAssetTransform(db, assetId, TransformContext.Default, {
    focalPointX: SEED_FOCAL_POINT.x,
    focalPointY: SEED_FOCAL_POINT.y,
  },);
}
