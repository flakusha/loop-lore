// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Asset Controller
 *
 * Route handlers for asset CRUD operations.
 * Delegates to asset service for business logic.
 *
 *   GET    /api/assets              — list assets (paginated, filterable)
 *   POST   /api/assets              — upload new asset (multipart)
 *   GET    /api/assets/:id          — get asset metadata
 *   GET    /api/assets/:id/raw      — serve original file
 *   GET    /api/assets/:id/download — download file (attachment)
 *   GET    /api/assets/:id/thumb    — serve thumbnail
 *   GET    /api/assets/:id/compressed — serve compressed variant
 *   DELETE /api/assets/:id          — delete asset
 *   POST   /api/assets/:id/links    — link to entity
 *   DELETE /api/assets/:id/links/:linkId — unlink from entity
 *
 * Barrel: preserves the original controller module surface
 * (`assetRoutes`, `handleUpload`, `UploadOpts`) for unchanged imports.
 */
export {
  assetRoutes,
} from "./routes";
export type {
  UploadOpts,
} from "./types";
export {
  handleUpload,
} from "./upload";
