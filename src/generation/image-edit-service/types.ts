// Image Edit Service — types + public API interface.
//
// Split from the former image-edit-service.ts class. The interface is the
// single source of truth for the API shape; the factory value in index.ts
// shares the same exported name (TS declaration merge).

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import type { EditHistory, ParsedCommand, } from "../image-edit-commands";

/** Service options */
export interface ImageEditServiceOpts {
  database?: Kysely<DB>;
  uploadDir?: string;
}

/** Edit request */
export interface EditImageRequest {
  /** Source asset ID to edit */
  sourceAssetId: string;
  /** User command text */
  command: string;
  /** Actor ID for ownership */
  actorId: string;
  /** Optional template ID override */
  templateId?: string;
  /** Optional custom denoising strength */
  denoisingStrength?: number;
}

/** Edit result */
export interface EditResult {
  success: boolean;
  editEntryId?: string;
  resultAssetId?: string;
  command?: ParsedCommand;
  error?: string;
}

/** Undo/Redo result */
export interface UndoRedoResult {
  success: boolean;
  assetId?: string;
  entryId?: string;
  error?: string;
}

/**
 * Image Edit Service — public API (single source of truth).
 *
 * The factory value `ImageEditService` (see index.ts) is declaration-merged
 * with this interface, so a single exported name is both the type and the
 * constructor/factory.
 */
export interface ImageEditService {
  editImage(request: EditImageRequest,): Promise<EditResult>;
  undoEdit(assetId: string,): Promise<UndoRedoResult>;
  redoEdit(assetId: string,): Promise<UndoRedoResult>;
  getEditHistory(assetId: string,): EditHistory | undefined;
  clearEditHistory(assetId: string,): void;
}

/**
 * The full service instance passed to dispatchers as `thisL`.
 * Extends the public API with the db handle and upload dir so dispatch bodies
 * can reach them.
 */
export type ImageEditServiceContext = ImageEditService & {
  db: Kysely<DB>;
  uploadDir: string;
};
