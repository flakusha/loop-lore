// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared bulk-export routines for the export routes.
 *
 * Both `routes/export.ts` (ZIP endpoint) and `routes/export-sse.ts` (SSE
 * progress endpoint) run the same per-type export pipelines — query rows,
 * write them into a JSZip folder, and record a checksum. This module hosts
 * that shared logic so the two handlers differ only in I/O: the SSE handler
 * wires an `onItem` notifier to drive its progress bar and the asset
 * manifest, while the plain handler passes none.
 */
export { exportAssetsToZip, } from "./assets";
export { exportCharactersToZip, } from "./characters";
export { exportChatsToZip, } from "./chats";
export { finalizeExportZip, } from "./finalize";
export { addChecksum, } from "./helpers";
export { exportLocationsToZip, } from "./locations";
export { buildWorldBundle, exportStoryToZip, } from "./story";
export type {
  ExportContext,
  ExportItem,
  FinalizeExportInput,
  WorldBundle,
} from "./types";
export { exportWorldsToZip, } from "./worlds";
