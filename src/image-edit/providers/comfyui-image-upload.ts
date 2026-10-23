// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ComfyUI input-image upload for image-edit runs.
 *
 * A ComfyUI `LoadImage` node takes the name of a file in ComfyUI's OWN input
 * directory, not bytes. An `image`-typed parameter carries the ASSET ID of an
 * image the caller owns: the provider resolves the id to bytes — owner check
 * first, chat key when the asset is encrypted — and uploads them before the
 * workflow is built.
 *
 * The parameter is never a path on this machine. It only ever reaches the
 * database as a bound query parameter, and the file that is read is the one
 * the asset row points at, so a caller cannot make the server open a file of
 * their choosing.
 *
 * The upload happens BEFORE the workflow is submitted. A failed upload aborts
 * the run, so ComfyUI never receives a filename it has no bytes for.
 */
import type { Kysely, } from "kysely";
import { basename, extname, } from "node:path";
import { getAssetData, getOwnedAsset, } from "../../assets/service";
import { type ChatKey, deriveChatKeyForChat, getSmk, } from "../../crypto";
import type { DB, } from "../../db/schema";
import type { ComfyUIClient, } from "../../generation/providers/comfyui";
import type { WorkflowTemplate, } from "../types";

/** Options for {@link uploadImageParams}. */
export interface UploadImageParamsOptions {
  /** Client used to reach ComfyUI. */
  client: ComfyUIClient;
  /** Template whose `image` parameters need a ComfyUI-side name. */
  template: WorkflowTemplate;
  /** Run parameters, mutated in place: asset ids become stored names. */
  params: Record<string, unknown>;
  /** Database the asset ids are resolved against. */
  database: Kysely<DB>;
  /** Directory the asset files live in. */
  uploadDir: string;
  /** The authenticated caller — only their own assets resolve. */
  ownerId: string;
  /** Chat whose key decrypts an encrypted input asset. */
  chatId?: string;
}

/** The file extension ComfyUI's loader expects for a mime type. */
const MIME_EXTENSIONS: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/bmp": ".bmp",
};

/**
 * A name no other upload can collide with.
 *
 * ComfyUI stores uploads under the name it is given and overwrites an
 * existing one. Two concurrent runs uploading different files that share a
 * basename would otherwise clobber each other: the first run's `LoadImage`
 * node would pick up the second run's bytes.
 * @param filename - Name the file would otherwise get
 * @returns {string}
 */
function uniqueName(filename: string,): string {
  const ext = extname(filename,);
  const stem = basename(filename, ext,);
  return `${stem}-${Date.now()}-${Math.random().toString(36,).slice(2, 8,)}${ext}`;
}

/** What the provider needs to read one owned asset. */
interface OwnedAssetSource {
  database: Kysely<DB>;
  uploadDir: string;
  ownerId: string;
  chatId?: string;
  assetId: string;
  /** The parameter the id came from — named in every failure. */
  parameterName: string;
}

/**
 * The bytes of an asset the caller owns, decrypted when it is chat-encrypted.
 *
 * "Missing" and "not yours" fail the same way: an asset id is not
 * authorization, and a differing answer would be an existence oracle on ids
 * the caller guessed.
 * @param source - the asset id and the context it is resolved in
 * @returns {Promise<{ buffer: Buffer; mimeType: string }>} the asset bytes
 * @throws {Error} When the asset is missing, owned by someone else, encrypted without a usable chat key, or has no readable file
 */
async function readOwnedAssetBytes(
  source: OwnedAssetSource,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const { database, uploadDir, ownerId, chatId, assetId, parameterName, } = source;

  const asset = await getOwnedAsset(database, assetId, ownerId,);
  if (!asset) {
    throw new Error(`Image parameter "${parameterName}": image asset not found or not owned by the caller`,);
  }

  let chatKey: ChatKey | undefined;
  if (asset.encryption_tier !== "public" && asset.encrypted_key_id) {
    const smk = getSmk();
    // Without a chat key the bytes stay encrypted. getAssetData says so
    // ("Chat key required to decrypt encrypted asset") rather than handing
    // ComfyUI ciphertext.
    if (smk && chatId) { chatKey = await deriveChatKeyForChat(database, chatId, smk,); }
  }

  let buffer: Buffer | null;
  try {
    buffer = await getAssetData(database, assetId, uploadDir, chatKey,);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error,);
    throw new Error(`Image parameter "${parameterName}": ${message}`,);
  }

  if (!buffer) { throw new Error(`Image parameter "${parameterName}": image asset has no readable file`,); }

  return { buffer, mimeType: asset.mime_type, };
}

/**
 * Upload every `image` parameter of the template and replace the asset id
 * with the name ComfyUI stored the bytes under.
 *
 * Every parameter is uploaded BEFORE any workflow is built, so a template
 * with two images uploads both or submits nothing.
 * @param options - Client, template, run parameters and the asset context
 * @returns {Promise<void>}
 * @throws {Error} When the asset cannot be resolved or the upload fails
 */
export async function uploadImageParams(options: UploadImageParamsOptions,): Promise<void> {
  const { client, template, params, database, uploadDir, ownerId, chatId, } = options;

  for (const parameter of template.parameters) {
    if (parameter.type !== "image") { continue; }

    const assetId = params[parameter.name];
    if (typeof assetId !== "string" || assetId === "") { continue; }

    const bytes = await readOwnedAssetBytes({
      database,
      uploadDir,
      ownerId,
      chatId,
      assetId,
      parameterName: parameter.name,
    },);

    const extension = MIME_EXTENSIONS[bytes.mimeType.toLowerCase()] ?? ".png";
    try {
      params[parameter.name] = await client.uploadImage(bytes.buffer, uniqueName(`image-edit${extension}`,),);
    } catch (error) {
      throw new Error(`ComfyUI upload of image parameter "${parameter.name}" failed: ${String(error,)}`,);
    }
  }
}
