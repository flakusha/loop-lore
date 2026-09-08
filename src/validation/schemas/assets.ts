// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Asset search validation schemas (unified-search gallery endpoint).
 */

import { t, } from "elysia";
import { AssetTypeSchema, AssetVisibilitySchema } from "./primitives";

export const AssetSearchQuery = t.Object({
  /** Fuzzy query over file name + description (required). */
  q: t.String({ minLength: 1, maxLength: 200 }),
  /** Restrict to one asset type. */
  assetType: t.Optional(AssetTypeSchema),
  /** Restrict to one visibility (non-admins only ever see their own + public). */
  visibility: t.Optional(AssetVisibilitySchema),
  /** Max hits per page. */
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100, default: 20 })),
  /** Result offset for pagination. */
  offset: t.Optional(t.Numeric({ minimum: 0, default: 0 })),
});

export const AssetSearchResult = t.Object({
  assetId: t.String(),
  filename: t.String(),
  altText: t.Nullable(t.String()),
  assetType: t.String(),
  mimeType: t.String(),
  visibility: t.String(),
  /** Fuzzy relevance in (0, 1]; higher is better. */
  matchScore: t.Number(),
});

export const AssetSearchResponse = t.Object({
  results: t.Array(AssetSearchResult),
  total: t.Number(),
  hasMore: t.Boolean(),
  query: t.String(),
});
