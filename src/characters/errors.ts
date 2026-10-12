// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Import/Export Error Classes
 *
 * Structured error types for character import/export operations.
 * Provides machine-readable error codes and user-friendly messages.
 * Every concrete class carries a literal `tag` (see `src/errors/tagged.ts`)
 * and {@link CHARACTERS_ERROR_STATUS} maps the family union onto HTTP
 * statuses exhaustively — adding a variant without a status entry is a
 * compile error, so the old silent `default: return 500` miss is impossible.
 */

import { ErrorCode, } from "../routes/http-utils";

// ── Import Errors ─────────────────────────────────────────────

/**
 * Base class for import-related errors. Concrete: tests and legacy callers
 * construct it directly; subclasses narrow {@link ImportError.tag} with
 * `override` and the exhaustive status map routes each to its HTTP status.
 */
export class ImportError extends Error {
  readonly tag: string;
  readonly code: ErrorCode;
  readonly details?: unknown;

  /**
   * @param message
   * @param code
   * @param details
   */
  constructor(message: string, code: ErrorCode = ErrorCode.BadRequest, details?: unknown,) {
    super(message,);
    this.name = "ImportError";
    this.tag = "characters/import";
    this.code = code;
    this.details = details;
  }
}

/** File format not recognized */
export class FormatDetectionError extends ImportError {
  override readonly tag = "characters/import-format" as const;

  /**
   * @param filename
   */
  constructor(filename: string,) {
    super(
      `Unable to detect character card format for "${filename}"`,
      ErrorCode.BadRequest,
      { filename, suggestion: "Ensure file is JSON, YAML, TOML, PNG with embedded data, or CHARX bundle", },
    );

    this.name = "FormatDetectionError";
  }
}

/** Character validation failed */
export class CharacterValidationError extends ImportError {
  override readonly tag = "characters/import-validation" as const;
  readonly validationErrors: string[];

  /**
   * @param errors
   */
  constructor(errors: string[],) {
    super(
      `Character validation failed: ${errors.join(", ",)}`,
      ErrorCode.ValidationError,
      { validationErrors: errors, },
    );

    this.name = "CharacterValidationError";
    this.validationErrors = errors;
  }
}

/** CHARX extraction failed */
export class CharxExtractionError extends ImportError {
  override readonly tag = "characters/import-charx" as const;

  /**
   * @param message
   * @param details
   */
  constructor(message: string, details?: unknown,) {
    super(`CHARX extraction failed: ${message}`, ErrorCode.BadRequest, details,);
    this.name = "CharxExtractionError";
  }
}

/** PNG extraction failed */
export class PngExtractionError extends ImportError {
  override readonly tag = "characters/import-png" as const;

  /**
   * @param message
   * @param details
   */
  constructor(message: string, details?: unknown,) {
    super(`PNG extraction failed: ${message}`, ErrorCode.BadRequest, details,);
    this.name = "PngExtractionError";
  }
}

/** Asset import failed (non-blocking) */
export class AssetImportError extends ImportError {
  override readonly tag = "characters/import-asset" as const;
  readonly assetName: string;

  /**
   * @param assetName
   * @param message
   * @param details
   */
  constructor(assetName: string, message: string, details?: unknown,) {
    super(`Failed to import asset "${assetName}": ${message}`, ErrorCode.BadRequest, details,);
    this.name = "AssetImportError";
    this.assetName = assetName;
  }
}

// ── Export Errors ─────────────────────────────────────────────

/**
 * Base class for export-related errors. Concrete: tests and legacy callers
 * construct it directly; subclasses narrow {@link ExportError.tag} with
 * `override` and the exhaustive status map routes each to its HTTP status.
 */
export class ExportError extends Error {
  readonly tag: string;
  readonly code: ErrorCode;
  readonly details?: unknown;

  /**
   * @param message
   * @param code
   * @param details
   */
  constructor(message: string, code: ErrorCode = ErrorCode.BadRequest, details?: unknown,) {
    super(message,);
    this.name = "ExportError";
    this.tag = "characters/export";
    this.code = code;
    this.details = details;
  }
}

/** Export format not supported */
export class UnsupportedExportFormatError extends ExportError {
  override readonly tag = "characters/export-format" as const;

  /**
   * @param format
   * @param supportedFormats
   */
  constructor(format: string, supportedFormats: string[],) {
    super(
      `Unsupported export format: "${format}". Supported formats: ${supportedFormats.join(", ",)}`,
      ErrorCode.BadRequest,
      { format, supportedFormats, },
    );

    this.name = "UnsupportedExportFormatError";
  }
}

/** Export data not found */
export class ExportDataNotFoundError extends ExportError {
  override readonly tag = "characters/export-data-missing" as const;

  /**
   * @param entity
   * @param userId
   */
  constructor(entity: string, userId: string,) {
    super(
      `No ${entity} found for export`,
      ErrorCode.NotFound,
      { entity, userId, },
    );

    this.name = "ExportDataNotFoundError";
  }
}

/** ZIP generation failed */
export class ZipGenerationError extends ExportError {
  override readonly tag = "characters/export-zip" as const;

  /**
   * @param message
   * @param details
   */
  constructor(message: string, details?: unknown,) {
    super(`ZIP generation failed: ${message}`, ErrorCode.ServerError, details,);
    this.name = "ZipGenerationError";
  }
}

// ── Error Handler ─────────────────────────────────────────────

/** Every tagged import/export error the character pipeline can surface. */
export type CharactersImportExportError =
  | ImportError
  | FormatDetectionError
  | CharacterValidationError
  | CharxExtractionError
  | PngExtractionError
  | AssetImportError
  | ExportError
  | UnsupportedExportFormatError
  | ExportDataNotFoundError
  | ZipGenerationError;

/**
 * HTTP status per tag — exhaustive over the union: a new variant without an
 * entry here is a compile error, which is what retires the old
 * `getHttpStatusFromErrorCode` default-500 runtime miss.
 */
const CHARACTERS_ERROR_STATUS: { [E in CharactersImportExportError["tag"]]: number } = {
  "characters/import": 400,
  "characters/import-format": 400,
  "characters/import-validation": 422,
  "characters/import-charx": 400,
  "characters/import-png": 400,
  "characters/import-asset": 400,
  "characters/export": 400,
  "characters/export-format": 400,
  "characters/export-data-missing": 404,
  "characters/export-zip": 500,
};

/**
 * Handle import/export errors and convert to structured API response.
 * Returns true if error was handled, false otherwise.
 * @param error
 * @returns unknown
 */
export function handleImportExportError(error: unknown,): { handled: true; response: Response } | { handled: false } {
  if (error instanceof ImportError || error instanceof ExportError) {
    return {
      handled: true,
      response: Response.json(
        {
          error: error.message,
          code: error.code,
          details: error.details,
        },
        { status: CHARACTERS_ERROR_STATUS[error.tag], },
      ),
    };
  }

  return { handled: false, };
}
