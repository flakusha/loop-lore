// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Asset tag validation schemas (gallery tagging G7).
 *
 * Request bodies and response envelopes for the per-asset tagging surface:
 * list / add / remove / rename tags, a tag-proposition feed with per-user
 * dismissal, and the shared autocomplete vocabulary.
 */

import { t, } from "elysia";

/** Tag ownership scope: a viewer's personal set vs. the asset's shared set. */
export const AssetTagScopeSchema = t.UnionEnum(["user", "global",],);

/** Provenance of a tag: manual entry or a metadata/RAG-derived proposal. */
export const AssetTagSourceSchema = t.UnionEnum(["manual", "rag",],);

/** One tag as returned to clients. */
export const AssetTagRecordSchema = t.Object({
  id: t.String(),
  tag: t.String(),
  scope: AssetTagScopeSchema,
  source: AssetTagSourceSchema,
},);

/** Body for adding a tag: `POST /api/assets/:id/tags`. */
export const AddAssetTagBody = t.Object({
  tag: t.String({ minLength: 1, maxLength: 64, },),
  scope: AssetTagScopeSchema,
},);

/** Body for removing a tag: `DELETE /api/assets/:id/tags`. */
export const RemoveAssetTagBody = t.Object({
  tag: t.String({ minLength: 1, maxLength: 64, },),
  scope: AssetTagScopeSchema,
},);

/** Body for renaming a tag: `POST /api/assets/:id/tags/rename`. */
export const RenameAssetTagBody = t.Object({
  oldTag: t.String({ minLength: 1, maxLength: 64, },),
  newTag: t.String({ minLength: 1, maxLength: 64, },),
  scope: AssetTagScopeSchema,
},);

/** Body for dismissing a proposed tag: `DELETE /api/assets/:id/tag-propositions`. */
export const DismissTagPropositionBody = t.Object({
  tag: t.String({ minLength: 1, maxLength: 64, },),
},);

/** One proposed tag. */
export const TagPropositionSchema = t.Object({
  tag: t.String(),
  provenance: t.UnionEnum(["alt_text", "filename",],),
},);

/** `GET /api/assets/:id/tags` — list of visible tags. */
export const AssetTagListResponse = t.Object({
  tags: t.Array(AssetTagRecordSchema,),
},);

/** Response for a single-tag mutation (add / rename). */
export const AssetTagResponse = t.Object({
  tag: AssetTagRecordSchema,
},);

/** `GET /api/assets/:id/tag-propositions` — proposed tags. */
export const TagPropositionListResponse = t.Object({
  propositions: t.Array(TagPropositionSchema,),
},);

/** `GET /api/tag-autocomplete` — distinct vocabulary. */
export const TagAutocompleteResponse = t.Object({
  tags: t.Array(t.String(),),
},);