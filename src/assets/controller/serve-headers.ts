// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { IMMUTABLE_CACHE_MAX_AGE, } from "../../config/constants";
import type { AssetRecord, } from "../service";

/** MIME types that execute script/markup when navigated to inline. */
const ACTIVE_CONTENT_TYPES: Record<string, true> = {
  "image/svg+xml": true,
  "text/html": true,
  "application/xhtml+xml": true,
  "application/xml": true,
  "text/xml": true,
};

/**
 * Cache policy by visibility: public assets may live in shared caches;
 * private/shared/restricted assets must stay out of shared caches — a
 * `public, immutable` header lets a shared cache replay private bytes to a
 * @param asset
 */
export function cacheControlFor(asset: AssetRecord,): string {
  if (asset.visibility === "public") {
    return `public, max-age=${IMMUTABLE_CACHE_MAX_AGE}, immutable`;
  }
  return "private, max-age=3600";
}

/**
 * Active content (SVG/HTML/XML) must never be served inline: direct
 * navigation executes embedded script. Force attachment for those types;
 * everything else stays inline.
 * @param asset
 * @param filename
 */
export function contentDispositionFor(asset: AssetRecord, filename: string,): Record<string, string> {
  const safeName = filename.replace(/[^\w.\- ]+/g, "_",);
  if (ACTIVE_CONTENT_TYPES[asset.mime_type]) {
    return { "Content-Disposition": `attachment; filename="${safeName}"`, };
  }
  return {};
}
