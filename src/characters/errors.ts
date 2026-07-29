/**
 * Import/Export Error Classes
 *
 * Structured error types for character import/export operations.
 * Provides machine-readable error codes and user-friendly messages.
 */

import { ErrorCode, } from "../routes/http-utils";

// ── Import Errors ─────────────────────────────────────────────

/** Base class for import-related errors */
export class ImportError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(message: string, code: ErrorCode = ErrorCode.BadRequest, details?: unknown,) {
    super(message,);
    this.name = "ImportError";
    this.code = code;
    this.details = details;
  }
}

/** File format not recognized */
export class FormatDetectionError extends ImportError {
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
  readonly validationErrors: string[];

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
  constructor(message: string, details?: unknown,) {
    super(`CHARX extraction failed: ${message}`, ErrorCode.BadRequest, details,);
    this.name = "CharxExtractionError";
  }
}

/** PNG extraction failed */
export class PngExtractionError extends ImportError {
  constructor(message: string, details?: unknown,) {
    super(`PNG extraction failed: ${message}`, ErrorCode.BadRequest, details,);
    this.name = "PngExtractionError";
  }
}

/** Asset import failed (non-blocking) */
export class AssetImportError extends ImportError {
  readonly assetName: string;

  constructor(assetName: string, message: string, details?: unknown,) {
    super(`Failed to import asset "${assetName}": ${message}`, ErrorCode.BadRequest, details,);
    this.name = "AssetImportError";
    this.assetName = assetName;
  }
}

// ── Export Errors ─────────────────────────────────────────────

/** Base class for export-related errors */
export class ExportError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(message: string, code: ErrorCode = ErrorCode.BadRequest, details?: unknown,) {
    super(message,);
    this.name = "ExportError";
    this.code = code;
    this.details = details;
  }
}

/** Export format not supported */
export class UnsupportedExportFormatError extends ExportError {
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
  constructor(message: string, details?: unknown,) {
    super(`ZIP generation failed: ${message}`, ErrorCode.ServerError, details,);
    this.name = "ZipGenerationError";
  }
}

// ── Error Handler ─────────────────────────────────────────────

/**
 * Handle import/export errors and convert to structured API response.
 * Returns true if error was handled, false otherwise.
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
        { status: getHttpStatusFromErrorCode(error.code,), },
      ),
    };
  }

  return { handled: false, };
}

/**
 * Get HTTP status code from error code.
 */
function getHttpStatusFromErrorCode(code: ErrorCode,): number {
  switch (code) {
    case ErrorCode.BadRequest: {
      return 400;
    }
    case ErrorCode.Unauthorized: {
      return 401;
    }
    case ErrorCode.Forbidden: {
      return 403;
    }
    case ErrorCode.NotFound: {
      return 404;
    }
    case ErrorCode.ValidationError: {
      return 422;
    }
    case ErrorCode.TooManyRequests: {
      return 429;
    }
    case ErrorCode.ServerError: {
      return 500;
    }
    case ErrorCode.NotImplemented: {
      return 501;
    }
    default: {
      return 500;
    }
  }
}
