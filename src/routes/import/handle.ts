// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { extractCharx, } from "../../characters/charx";
import { handleImportExportError, } from "../../characters/errors";
import { parseCharacterCard, } from "../../characters/parser";
import type { DB, } from "../../db/schema";
import { jsonStringifyOr, safeJsonStringify, } from "../../utils";
import { safeFromUint8Array, } from "../../utils/safe-buffer";
import { HttpStatus, jsonError, unauthorizedResponse, } from "../http-utils";
import { importActor, } from "./actor";

/** True when the file is a CHARX archive (by extension or ZIP magic bytes). */
function isCharxFile(filename: string, fileBytes: Buffer,): boolean {
  return filename.toLowerCase().endsWith(".charx",) ||
    (fileBytes.length > 4 &&
      fileBytes[0] === 0x50 && fileBytes[1] === 0x4B &&
      fileBytes[2] === 0x03 && fileBytes[3] === 0x04);
}

/** Import a CHARX archive: extract assets + parse embedded card. */
async function importFromCharx(
  fileBytes: Buffer,
  filename: string,
  database: Kysely<DB>,
  userId: string,
  uploadDir: string | undefined,
): Promise<Response> {
  const charxResult = await extractCharx(fileBytes,);
  const charxAssets: { name: string; type: string; data: Buffer }[] = [];
  for (const asset of charxResult.assets) {
    if (asset.data !== undefined) {
      charxAssets.push({ name: `${asset.name}.${asset.ext}`, type: asset.type, data: asset.data, },);
    }
  }

  const cardJsonResult = safeJsonStringify(charxResult.card,);
  const result = await parseCharacterCard(
    Buffer.from(cardJsonResult.ok ? cardJsonResult.value : jsonStringifyOr(charxResult.card, "{}",), "utf8",),
    filename,
  );

  return await importActor({
    character: result.character,
    format: "charx",
    warnings: result.warnings,
    database,
    userId,
    rawSource: filename,
    sourceFormat: "charx",
    charxAssets,
    uploadDir,
  },);
}

/** Import a standard character card (JSON / PNG / YAML / TOML). */
async function importFromStandard(
  fileBytes: Buffer,
  filename: string,
  database: Kysely<DB>,
  userId: string,
  uploadDir: string | undefined,
): Promise<Response> {
  const result = await parseCharacterCard(fileBytes, filename,);

  // For PNG imports, the file itself is the avatar
  let pngAvatar: { name: string; type: string; data: Buffer } | undefined;
  if (uploadDir && (result.format === "png-v2" || result.format === "png-v3")) {
    pngAvatar = {
      name: `${filename.replace(/\.[^/.]+$/, "",) || "avatar"}.png`,
      type: "avatar",
      data: fileBytes,
    };
  }

  return await importActor({
    character: result.character,
    format: result.format,
    warnings: result.warnings,
    database,
    userId,
    rawSource: fileBytes.toString("utf8",),
    sourceFormat: result.format,
    charxAssets: pngAvatar ? [pngAvatar,] : undefined,
    uploadDir,
  },);
}

export async function handleImport(
  request: Request,
  database: Kysely<DB>,
  userId: string,
  uploadDir?: string,
): Promise<Response> {
  if (!userId) { return unauthorizedResponse(); }

  const contentType = request.headers.get("content-type",) ?? "";

  if (contentType.includes("multipart/form-data",)) {
    const formData = await request.formData();
    const file = formData.get("file",);
    if (!file || !(file instanceof File)) {
      return jsonError({ message: "file field is required", status: HttpStatus.BadRequest, },);
    }

    const fileBytesResult = safeFromUint8Array(Buffer.from(await file.arrayBuffer(),),);
    if (!fileBytesResult.ok) {
      return jsonError({ message: fileBytesResult.error.message, status: HttpStatus.BadRequest, },);
    }
    const fileBytes = fileBytesResult.buffer;
    const filename = file.name ?? "";

    try {
      if (isCharxFile(filename, fileBytes,)) {
        return await importFromCharx(fileBytes, filename, database, userId, uploadDir,);
      }
      return await importFromStandard(fileBytes, filename, database, userId, uploadDir,);
    } catch (error) {
      // Handle structured import errors
      const handled = handleImportExportError(error,);
      if (handled.handled) {
        return handled.response;
      }

      // Handle other errors
      const parseError = error as { code?: string; message?: string; suggestion?: string };
      return jsonError({
        message: parseError.message ?? "Failed to parse character card",
        status: HttpStatus.BadRequest,
      },);
    }
  }

  return jsonError({ message: "Expected multipart/form-data", status: HttpStatus.BadRequest, },);
}
