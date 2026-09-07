// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Branch coverage for character import/export errors
 * (src/characters/errors.ts).
 *
 * Every error constructor (happy + damaged inputs) plus the
 * error→Response mapping across all HTTP status arms.
 */
import { describe, expect, test, } from "bun:test";
import { ErrorCode, } from "../routes/http-utils";
import {
  AssetImportError,
  CharacterValidationError,
  CharxExtractionError,
  ExportDataNotFoundError,
  ExportError,
  FormatDetectionError,
  handleImportExportError,
  ImportError,
  PngExtractionError,
  UnsupportedExportFormatError,
  ZipGenerationError,
} from "./errors";

describe("import errors", () => {
  test("ImportError defaults to BadRequest without details", () => {
    const err = new ImportError("boom",);
    expect(err,).toBeInstanceOf(Error,);
    expect(err.name,).toBe("ImportError",);
    expect(err.code,).toBe(ErrorCode.BadRequest,);
    expect(err.details,).toBeUndefined();
  });

  test("FormatDetectionError names the file and suggests formats", () => {
    const err = new FormatDetectionError("mystery.bin",);
    expect(err.message,).toContain("mystery.bin",);
    expect(err.code,).toBe(ErrorCode.BadRequest,);
  });

  test("FormatDetectionError handles an empty filename", () => {
    const err = new FormatDetectionError("",);
    expect(err.message,).toContain('""',);
  });

  test("CharacterValidationError joins every violation", () => {
    const err = new CharacterValidationError(["name missing", "avatar too large",],);
    expect(err.message,).toContain("name missing",);
    expect(err.message,).toContain("avatar too large",);
    expect(err.code,).toBe(ErrorCode.ValidationError,);
    expect(err.validationErrors,).toHaveLength(2,);
  });

  test("CharxExtractionError carries optional details", () => {
    const details = { entry: "card.json", };
    const err = new CharxExtractionError("truncated zip", details,);
    expect(err.message,).toContain("truncated zip",);
    expect(err.details,).toBe(details,);
    const bare = new CharxExtractionError("truncated zip",);
    expect(bare.details,).toBeUndefined();
  });

  test("PngExtractionError prefixes the message", () => {
    const err = new PngExtractionError("no tEXt chunk",);
    expect(err.message,).toContain("no tEXt chunk",);
    expect(err.name,).toBe("PngExtractionError",);
  });

  test("AssetImportError records the asset name", () => {
    const err = new AssetImportError("portrait.png", "unsupported mime",);
    expect(err.assetName,).toBe("portrait.png",);
    expect(err.message,).toContain("portrait.png",);
    expect(err.message,).toContain("unsupported mime",);
  });
});

describe("export errors", () => {
  test("ExportError defaults to BadRequest", () => {
    const err = new ExportError("nope",);
    expect(err.name,).toBe("ExportError",);
    expect(err.code,).toBe(ErrorCode.BadRequest,);
  });

  test("UnsupportedExportFormatError lists supported formats", () => {
    const err = new UnsupportedExportFormatError("pdf", ["json", "yaml",],);
    expect(err.message,).toContain('"pdf"',);
    expect(err.message,).toContain("json, yaml",);
  });

  test("UnsupportedExportFormatError handles an empty format list", () => {
    const err = new UnsupportedExportFormatError("pdf", [],);
    expect(err.message,).toContain('"pdf"',);
  });

  test("ExportDataNotFoundError names the entity", () => {
    const err = new ExportDataNotFoundError("character", "user-1",);
    expect(err.code,).toBe(ErrorCode.NotFound,);
    expect(err.message,).toContain("character",);
  });

  test("ZipGenerationError maps to ServerError", () => {
    const err = new ZipGenerationError("disk full",);
    expect(err.code,).toBe(ErrorCode.ServerError,);
    expect(err.message,).toContain("disk full",);
  });
});

describe("handleImportExportError", () => {
  test("maps an import error to a 400 JSON response", async () => {
    const result = handleImportExportError(new FormatDetectionError("x.dat",),);
    expect(result.handled,).toBe(true,);
    if (!result.handled) { throw new Error("unreachable",); }
    expect(result.response.status,).toBe(400,);
    const body = await result.response.json() as { error: string; code: string };
    expect(body.code,).toBe(ErrorCode.BadRequest,);
    expect(body.error,).toContain("x.dat",);
  });

  test("maps a validation error to 422", async () => {
    const result = handleImportExportError(new CharacterValidationError(["bad",],),);
    expect(result.handled,).toBe(true,);
    if (!result.handled) { throw new Error("unreachable",); }
    expect(result.response.status,).toBe(422,);
  });

  test("maps a not-found export error to 404", () => {
    const result = handleImportExportError(new ExportDataNotFoundError("world", "u1",),);
    expect(result.handled,).toBe(true,);
    if (!result.handled) { throw new Error("unreachable",); }
    expect(result.response.status,).toBe(404,);
  });

  test("maps a zip failure to 500", () => {
    const result = handleImportExportError(new ZipGenerationError("io",),);
    expect(result.handled,).toBe(true,);
    if (!result.handled) { throw new Error("unreachable",); }
    expect(result.response.status,).toBe(500,);
  });

  test("maps every remaining error code to its HTTP status", () => {
    const cases: [ErrorCode, number,][] = [
      [ErrorCode.Unauthorized, 401,],
      [ErrorCode.Forbidden, 403,],
      [ErrorCode.TooManyRequests, 429,],
      [ErrorCode.NotImplemented, 501,],
    ];
    for (const [code, status,] of cases) {
      const result = handleImportExportError(new ImportError("m", code,),);
      expect(result.handled,).toBe(true,);
      if (!result.handled) { throw new Error("unreachable",); }
      expect(result.response.status,).toBe(status,);
    }
  });

  test("falls back to 500 for an unknown error code", () => {
    const result = handleImportExportError(new ImportError("m", "NOPE" as ErrorCode,),);
    expect(result.handled,).toBe(true,);
    if (!result.handled) { throw new Error("unreachable",); }
    expect(result.response.status,).toBe(500,);
  });

  test("leaves non-import/export errors unhandled", () => {
    expect(handleImportExportError(new Error("plain",),),).toEqual({ handled: false, },);
    expect(handleImportExportError("string failure",),).toEqual({ handled: false, },);
    expect(handleImportExportError(null,),).toEqual({ handled: false, },);
  });
});
