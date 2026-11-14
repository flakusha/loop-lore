// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/integrations/loop-lore-facade/ops/assets.ts — facade ops over the
// asset gallery (harness parity gap #6: assets had no facade op).
//
// SECURITY: every read runs through the repo's OWN asset ACL
// (src/assets/service/read.ts — visibleAssetFilter / canAccessAsset) with the
// CALLING principal as the actor, so another user's private asset is neither
// listed nor fetchable. The facade passes NO admin role, so the ACL's admin
// bypass (which the gallery grants) never widens a facade call. The payload
// is METADATA ONLY: the bytes, the storage path, the storage backend and the
// encryption key id never leave the server.

import { type Static, } from "@sinclair/typebox";
import { Value, } from "@sinclair/typebox/value";
import { t, } from "elysia";
import type { Kysely, } from "kysely";
import { chatPolicy, } from "../../../api-governance/rate-limiting/policies";
import { canAccessAsset, getAsset, listAssets, } from "../../../assets/service";
import type { AssetRecord, } from "../../../assets/service";
import type { Config, } from "../../../config/schema";
import type { DB, } from "../../../db/schema";
import { type FacadeRegistry, } from "../registry";
import type { FacadeContext, FacadeOp, FacadeOutputSchema, FacadeResult, } from "../types";
import { badBodyResult, callerIdentity, notFoundResult, READ_ONLY_ANNOTATIONS, } from "./shared";

/** Shared registration deps — the same shape the other op modules carry. */
export interface AssetsFacadeDeps {
  database: Kysely<DB>;
  config: Config;
}

/** assets.list body: pagination only — the caller cannot widen the ACL. */
export const AssetsListBody = t.Object({
  page: t.Optional(t.Number({ minimum: 1, },),),
  pageSize: t.Optional(t.Number({ minimum: 1, maximum: 200, },),),
},);

/** assets.get body: the asset id. */
export const AssetsGetBody = t.Object({ assetId: t.String({ minLength: 1, },), },);

/** The metadata fields a facade caller may see — one property per field. */
const ASSET_METADATA_PROPERTIES = {
  id: { type: "string", },
  filename: { type: "string", },
  mimeType: { type: "string", },
  assetType: { type: "string", },
  sizeBytes: { type: "number", },
  visibility: { type: "string", },
  width: { type: "number", },
  height: { type: "number", },
  durationSecs: { type: "number", },
  altText: { type: "string", },
  createdAt: { type: "string", },
};

/** assets.list's structured result: the metadata rows + the total count. */
export const AssetsListOutputSchema: FacadeOutputSchema = {
  type: "object",
  properties: {
    data: { type: "array", items: { type: "object", properties: ASSET_METADATA_PROPERTIES, }, },
    total: { type: "number", },
  },
  required: ["data", "total",],
};

/** assets.get's structured result: one asset's metadata. */
export const AssetMetadataOutputSchema: FacadeOutputSchema = {
  type: "object",
  properties: ASSET_METADATA_PROPERTIES,
  required: ["id", "filename", "mimeType", "assetType", "sizeBytes", "visibility", "createdAt",],
};

/** The metadata a facade caller may see — never the bytes, path or key id. */
interface AssetMetadata {
  id: string;
  filename: string;
  mimeType: string;
  assetType: string;
  sizeBytes: number;
  visibility: string;
  width: number | null;
  height: number | null;
  durationSecs: number | null;
  altText: string | null;
  createdAt: string;
}

/**
 * Project an asset row onto the metadata a facade caller may see.
 * @param asset - the stored asset row
 * @returns the metadata projection
 */
function toAssetMetadata(asset: AssetRecord,): AssetMetadata {
  return {
    id: asset.id,
    filename: asset.filename,
    mimeType: asset.mime_type,
    assetType: asset.asset_type,
    sizeBytes: asset.size_bytes,
    visibility: asset.visibility,
    width: asset.width,
    height: asset.height,
    durationSecs: asset.duration_secs,
    altText: asset.alt_text,
    createdAt: asset.created_at,
  };
}

/**
 * Register the assets ops on a registry.
 * @param registry - the facade registry
 * @param deps - database/config the ops read through
 * @throws {Error} when an op name collides on registration
 */
export function registerAssetsOps(registry: FacadeRegistry, deps: AssetsFacadeDeps,): void {
  const { database, } = deps;

  const ops: FacadeOp[] = [
    {
      name: "assets.list",
      domain: "assets",
      summary: "List the assets the calling principal may see",
      description: "Same ACL as the asset gallery: the calling principal's own assets plus the " +
        "public and explicitly shared ones. Metadata only — the bytes, the storage path and the " +
        "encryption key id never leave the server.",
      scope: "read",
      ratePolicy: chatPolicy,
      bodySchema: AssetsListBody,
      annotations: READ_ONLY_ANNOTATIONS,
      outputSchema: AssetsListOutputSchema,
      handler: async (ctx: FacadeContext, body: unknown,): Promise<FacadeResult> => {
        if (!Value.Check(AssetsListBody, body,)) { return badBodyResult("assets.list",); }
        const parsed = body as Static<typeof AssetsListBody>;
        const { userId, } = callerIdentity(ctx,);

        const { data, total, } = await listAssets(database, {
          page: parsed.page,
          pageSize: parsed.pageSize,
          actorId: userId,
          // The facade never escalates to the repo's admin bypass: a facade
          // caller sees the assets it owns plus the public/shared ones, never
          // another user's private asset.
          actorRole: null,
        },);

        return { ok: true, status: 200, json: { data: data.map(toAssetMetadata,), total, }, };
      },
    },
    {
      name: "assets.get",
      domain: "assets",
      summary: "Fetch one asset's metadata",
      description: "Same ACL as the asset gallery: an asset the calling principal may not see is a " +
        "404, never its data. Metadata only — no bytes, no storage path, no encryption key id.",
      scope: "read",
      ratePolicy: chatPolicy,
      bodySchema: AssetsGetBody,
      annotations: READ_ONLY_ANNOTATIONS,
      outputSchema: AssetMetadataOutputSchema,
      handler: async (ctx: FacadeContext, body: unknown,): Promise<FacadeResult> => {
        if (!Value.Check(AssetsGetBody, body,)) { return badBodyResult("assets.get",); }
        const parsed = body as Static<typeof AssetsGetBody>;
        const { userId, } = callerIdentity(ctx,);

        const accessible = await canAccessAsset(database, parsed.assetId, userId, null,);
        if (!accessible) { return notFoundResult("asset not found",); }

        const asset = await getAsset(database, parsed.assetId,);
        if (!asset) { return notFoundResult("asset not found",); }

        return { ok: true, status: 200, json: toAssetMetadata(asset,), };
      },
    },
  ];

  for (const op of ops) {
    const registered = registry.register(op,);
    if (!registered.ok) {
      throw new Error(registered.message,);
    }
  }
}
