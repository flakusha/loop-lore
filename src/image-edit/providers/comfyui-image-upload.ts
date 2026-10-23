// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ComfyUI input-image upload for image-edit runs.
 *
 * A ComfyUI `LoadImage` node takes the name of a file in ComfyUI's OWN input
 * directory, not a path on this machine. The image-edit request carries a
 * local path (or a data URI), so the provider uploads the bytes first and
 * substitutes the stored name. Uploading is a ComfyUI-protocol concern, so
 * it belongs to the provider rather than the route: the route only knows
 * where the image lives locally.
 *
 * The upload happens BEFORE the workflow is submitted. A failed upload aborts
 * the run, so ComfyUI never receives a filename it has no bytes for.
 */
import { readFile, } from "node:fs/promises";
import { basename, extname, } from "node:path";
import type { ComfyUIClient, } from "../../generation/providers/comfyui";
import { mustFromBase64, } from "../../utils/safe-buffer";
import type { WorkflowTemplate, } from "../types";

/** Options for {@link uploadImageParams}. */
export interface UploadImageParamsOptions {
  /** Client used to reach ComfyUI. */
  client: ComfyUIClient;
  /** Template whose `image` parameters need a ComfyUI-side name. */
  template: WorkflowTemplate;
  /** Run parameters, mutated in place: local paths become stored names. */
  params: Record<string, unknown>;
}

/** A base64 image data URI. */
const DATA_URI_RE = /^data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=]+)$/i;

/**
 * Whether a value names a file on this machine.
 *
 * A bare name (`photo.png`, `sub/photo.png`) is a file in ComfyUI's input
 * directory and must pass through untouched. Only an absolute or explicitly
 * relative path is read locally.
 * @param value - Parameter value
 * @returns {boolean}
 */
function isLocalPath(value: string,): boolean {
  return value.startsWith("/",) ||
    value.startsWith("./",) ||
    value.startsWith("../",) ||
    /^[A-Za-z]:[\\/]/.test(value,);
}

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

/**
 * Read the bytes of a local image parameter.
 * @param value - A local path or a base64 data URI
 * @returns {Promise<{ buffer: Buffer; filename: string } | null>} Null when the value is not a local image
 * @throws {Error} When a local path cannot be read or a data URI cannot be decoded
 */
async function readLocalImage(
  value: string,
): Promise<{ buffer: Buffer; filename: string } | null> {
  const dataUri = DATA_URI_RE.exec(value,);
  if (dataUri) {
    return { buffer: mustFromBase64(dataUri[1]!,), filename: "input-image.png", };
  }

  if (!isLocalPath(value,)) { return null; }

  try {
    return { buffer: await readFile(value,), filename: basename(value,), };
  } catch (error) {
    throw new Error(`ComfyUI input image not readable: ${value} (${String(error,)})`,);
  }
}

/**
 * Upload every `image` parameter of the template and replace the local value
 * with the name ComfyUI stored it under.
 *
 * A parameter that is not a local image is left alone: it already names a
 * file in ComfyUI's input directory.
 * @param options - Client, template and the run parameters
 * @returns {Promise<void>}
 * @throws {Error} When a local image cannot be read or the upload fails
 */
export async function uploadImageParams(options: UploadImageParamsOptions,): Promise<void> {
  const { client, template, params, } = options;

  for (const parameter of template.parameters) {
    if (parameter.type !== "image") { continue; }

    const value = params[parameter.name];
    if (typeof value !== "string" || value === "") { continue; }

    const local = await readLocalImage(value,);
    if (!local) { continue; }

    params[parameter.name] = await client.uploadImage(local.buffer, uniqueName(local.filename,),);
  }
}
