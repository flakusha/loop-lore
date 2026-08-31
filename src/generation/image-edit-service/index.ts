// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Image Edit Service — factory + merged public API
 *
 * Splits the former `ImageEditService` class into standalone dispatcher
 * functions (edit / history / apply) threaded with an explicit `thisL`
 * context, reassembled here by a factory.
 *
 * `ImageEditService` is a single source of truth: the interface IS the API
 * type and the factory value shares the same exported name (TS declaration
 * merge), so there is no parallel interface to maintain. Callers interact
 * through one name:
 *
 * ```ts
 * const svc = ImageEditService({ database });      // factory value
 * const s: ImageEditService = ImageEditService(opts); // interface type
 * ```
 */
import { loadConfig, } from "../../config/load";
import { editImage as editImageDispatch, } from "./edit";
import {
  clearEditHistory as clearEditHistoryDispatch,
  getEditHistory as getEditHistoryDispatch,
  redoEdit as redoEditDispatch,
  undoEdit as undoEditDispatch,
} from "./history";
import type {
  ImageEditService as ImageEditServiceIface,
  ImageEditServiceContext,
  ImageEditServiceOpts,
} from "./types";

/** Public API type — merged with the factory value below. */
// The empty interface is intentional: it merges the `ImageEditService` factory
// value with a same-named type so one name is both API type and constructor.

export interface ImageEditService extends ImageEditServiceIface {}

export type {
  EditImageRequest,
  EditResult,
  ImageEditServiceOpts,
  UndoRedoResult,
} from "./types";

/**
 * Create an ImageEditService instance.
 * @param opts - Service options (matches the former `new ImageEditService(opts)`)
 * @returns An ImageEditService bound to the given database
 */
export function ImageEditService(opts: ImageEditServiceOpts = {},): ImageEditService {
  if (!opts.database) {
    throw new Error("ImageEditService requires a database instance",);
  }
  const config = loadConfig();
  const db = opts.database;
  const uploadDir = opts.uploadDir ?? config.assets.uploadDir;

  const self: ImageEditServiceContext = {
    db,
    uploadDir,
    editImage: (request,) => editImageDispatch({ thisL: self, request, },),
    undoEdit: (assetId,) => undoEditDispatch({ thisL: self, assetId, },),
    redoEdit: (assetId,) => redoEditDispatch({ thisL: self, assetId, },),
    getEditHistory: (assetId,) => getEditHistoryDispatch({ thisL: self, assetId, },),
    clearEditHistory: (assetId,) => clearEditHistoryDispatch({ thisL: self, assetId, },),
  };
  return self;
}
