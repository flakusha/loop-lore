import type { Kysely, } from "kysely";
import { extractCharx, } from "../../characters/charx";
import { handleImportExportError, } from "../../characters/errors";
import { parseCharacterCard, } from "../../characters/parser";
import type { DB, } from "../../db/schema";
import { jsonStringifyOr, safeJsonStringify, } from "../../utils";
import { safeFromUint8Array, } from "../../utils/safe-buffer";
import { HttpStatus, jsonError, unauthorizedResponse, } from "../http-utils";
import { importActor, } from "./actor";

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
      // Check for CHARX format (ZIP with card.json)
      const isCharx = filename.toLowerCase().endsWith(".charx",) ||
        (fileBytes.length > 4 &&
          fileBytes[0] === 0x50 && fileBytes[1] === 0x4B &&
          fileBytes[2] === 0x03 && fileBytes[3] === 0x04);

      if (isCharx) {
        // Extract CHARX assets
        const charxResult = await extractCharx(fileBytes,);
        const charxAssets: { name: string; type: string; data: Buffer }[] = [];
        for (const asset of charxResult.assets) {
          if (asset.data !== undefined) {
            charxAssets.push({
              name: `${asset.name}.${asset.ext}`,
              type: asset.type,
              data: asset.data,
            },);
          }
        }

        // Parse the card from CHARX
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

      // Standard parse for non-CHARX formats
      const result = await parseCharacterCard(fileBytes, filename,);

      // For PNG imports, the file itself is the avatar
      let pngAvatar: { name: string; type: string; data: Buffer } | undefined;
      if ((result.format === "png-v2" || result.format === "png-v3") && uploadDir) {
        pngAvatar = {
          name: `${filename.replace(/\.[^/.]+$/, "",) || "avatar"}.png`,
          type: "avatar",
          data: fileBytes,
        };
      }

      // Import the character
      const rawSource = fileBytes.toString("utf8",);
      return await importActor({
        character: result.character,
        format: result.format,
        warnings: result.warnings,
        database,
        userId,
        rawSource,
        sourceFormat: result.format,
        charxAssets: pngAvatar ? [pngAvatar,] : undefined,
        uploadDir,
      },);
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
