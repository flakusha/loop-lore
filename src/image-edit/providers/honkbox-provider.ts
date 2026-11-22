// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Honkbox image-edit provider — posts a PNG + optional mask to
 * `POST /v1/images/edits` and stores the returned images as assets.
 *
 * Wire contract from honkbox `crates/server/src/routes/images_edit.rs`:
 * multipart fields `image`, `mask`, `prompt`, `model`, `strength`, `size`,
 * `recipe`, `sampler`, `scheduler`, `cfg_scale`, `negative_prompt`, `seed`,
 * `steps`, `output_format`, `output_compression` and a JSON `loras` array of
 * `{slug, strength}`. Response is `{ data: [{ b64_json }] }`.
 */

import type { Kysely, } from "kysely";
import sharp from "sharp";
import { extractImageMetadata, } from "../../assets/metadata";
import { createAsset, getAssetData, getOwnedAsset, linkAsset, } from "../../assets/service";
import { loadConfig, } from "../../config/load";
import { deriveChatKeyForChat, getSmk, } from "../../crypto";
import { getDatabase, } from "../../db";
import type { DB, } from "../../db/schema";
import {
  type HonkboxProbeResult,
  isHonkboxFeatureEnabled,
} from "../../integrations/honkbox/capabilities";
import { honkboxImageBaseUrl, } from "../../integrations/honkbox/provider-config";
import { safeFetch, safeJsonStringify, } from "../../utils";
import type {
  ImageEditBackend,
  ImageEditCategory,
  ImageEditExecuteOpts,
  ImageEditProvider,
  ImageEditRequest,
  ImageEditResult,
  WorkflowTemplate,
} from "../types";

/** Decoded honkbox edits response (only the fields loop-lore consumes). */
export interface HonkboxEditResponse {
  /** One entry per rendered image; only `b64_json` is required here. */
  readonly data?: readonly { readonly b64_json?: string }[];
}

/** Injectable transport so payload tests never open a socket. */
export type HonkboxEditPost = (
  url: string,
  form: FormData,
  apiKey?: string,
) => Promise<HonkboxEditResponse>;

/** @param baseUrl - honkbox URL, with or without a trailing `/v1`
 * @returns origin base URL used by the `/v1/images/edits` route
 */
function editsUrl(baseUrl: string,): string {
  return `${honkboxImageBaseUrl(baseUrl,)}/v1/images/edits`;
}

/** Default transport: bounded, no auth-error redirect, explicit bearer key. */
async function postEdit(
  url: string,
  form: FormData,
  apiKey?: string,
): Promise<HonkboxEditResponse> {
  const result = await safeFetch<HonkboxEditResponse>(url, {
    method: "POST",
    body: form,
    timeout: 120_000,
    handle401: false,
    ...(apiKey ? { headers: { Authorization: `Bearer ${apiKey}`, }, } : {}),
  },);

  if (!result.ok) { throw new Error(`honkbox image edit failed: ${result.error.message}`,); }
  return result.data;
}

/** Scalar multipart fields accepted verbatim by honkbox's edits handler. */
const SCALAR_FIELDS = [
  "model",
  "strength",
  "size",
  "recipe",
  "sampler",
  "scheduler",
  "cfg_scale",
  "negative_prompt",
  "seed",
  "steps",
  "output_format",
  "output_compression",
] as const;

/** @param opts - PNG source/mask blobs and the request's parameter bag
 * @returns the exact multipart body honkbox parses for `/v1/images/edits`
 * @throws {Error} when the LoRA array cannot be serialized
 */
export function buildHonkboxEditForm(opts: {
  /** Source PNG bytes; honkbox rejects non-PNG magic. */
  readonly image: Blob;
  /** Optional inpaint mask PNG. */
  readonly mask?: Blob;
  /** Request parameters; only honkbox-known keys are forwarded. */
  readonly params: Record<string, unknown>;
},): FormData {
  const { image, mask, params, } = opts;
  const form = new FormData();
  form.set("image", image, "image.png",);
  if (mask) { form.set("mask", mask, "mask.png",); }
  form.set("prompt", typeof params.prompt === "string" ? params.prompt : "",);

  for (const field of SCALAR_FIELDS) {
    const value = params[field];
    if (value !== undefined && value !== null && value !== "") {
      form.set(field, String(value,),);
    }
  }

  const loras = params.loras;
  if (Array.isArray(loras,) && loras.length > 0) {
    // loop-lore templates carry `path`; honkbox resolves `slug` against its
    // LoRA catalog. Strength is passed through for API-side validation.
    const encoded = safeJsonStringify(loras.map((entry: Record<string, unknown>,) => ({
      slug: entry.slug ?? entry.path,
      strength: entry.strength,
    })),);

    if (!encoded.ok) { throw new Error(`honkbox LoRA payload: ${encoded.error.message}`,); }

    form.set("loras", encoded.value,);
  }

  return form;
}

/** Options for {@link HonkboxEditProvider}. */
export interface HonkboxEditProviderOptions {
  /** Honkbox base URL (with or without `/v1`). */
  readonly baseUrl: string;
  /** Optional bearer credential. */
  readonly apiKey?: string;
  /** Cached/fresh probe; only `imageOps` gates selection. */
  readonly probe: HonkboxProbeResult | undefined;
  /** Injected transport for tests; defaults to bounded `safeFetch`. */
  readonly post?: HonkboxEditPost;
  /** Injected database for tests; defaults to the process database. */
  readonly database?: Kysely<DB>;
  /** Injected asset directory for tests. */
  readonly uploadDir?: string;
}

/** @param source - owned asset bytes, possibly non-PNG
 * @returns PNG bytes honkbox accepts
 */
async function asPng(source: Buffer,): Promise<Buffer> {
  const pngMagic = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10,],);
  return source.subarray(0, 8,).equals(pngMagic,)
    ? source
    : await sharp(source,).png().toBuffer();
}

/** Resolve and PNG-normalize one owned asset named by an image parameter. */
async function imageBytes(
  database: Kysely<DB>,
  uploadDir: string,
  assetId: string,
  ownerId: string,
  chatId: string | undefined,
  parameterName: string,
): Promise<Blob> {
  const asset = await getOwnedAsset(database, assetId, ownerId,);
  if (!asset) {
    throw new Error(`Image parameter "${parameterName}": asset not found or not owned by the caller`,);
  }

  let chatKey;
  if (asset.encryption_tier !== "public" && asset.encrypted_key_id) {
    const smk = getSmk();
    if (smk && chatId) { chatKey = await deriveChatKeyForChat(database, chatId, smk,); }
  }

  const data = await getAssetData(database, assetId, uploadDir, chatKey,);
  if (!data) { throw new Error(`Image parameter "${parameterName}": asset has no readable file`,); }
  const png = await asPng(data,);
  const bytes = new Uint8Array(png.byteLength,);
  bytes.set(png,);

  return new Blob([bytes,], { type: "image/png", },);
}

/** Image-edit provider backed by honkbox `/v1/images/edits`. */
export class HonkboxEditProvider implements ImageEditProvider {
  readonly name: ImageEditBackend = "honkbox";

  /** @param opts - endpoint, probe and optional test seams */
  constructor(private readonly opts: HonkboxEditProviderOptions,) {}

  /** @returns whether the probed server advertises `imageOps` */
  healthCheck(): Promise<boolean> {
    return Promise.resolve(isHonkboxFeatureEnabled(this.opts.probe, "imageOps",),);
  }

  /** @returns the edit categories this adapter can execute */
  listCapabilities(): Promise<ImageEditCategory[]> {
    return Promise.resolve(["img2img", "inpaint",],);
  }

  /**
   * @param request - template id, params and chat/message linkage
   * @param template - template whose `image` parameters name asset ids
   * @param opts - authenticated owner and progress callback
   * @returns the stored images in honkbox's response order
   */
  async execute(
    request: ImageEditRequest,
    template: WorkflowTemplate,
    opts: ImageEditExecuteOpts,
  ): Promise<ImageEditResult[]> {
    const database = this.opts.database ?? getDatabase();
    const uploadDir = this.opts.uploadDir ?? loadConfig().assets.uploadDir;
    const images = template.parameters.filter((p,) => p.type === "image");
    const sourceParam = images.find((p,) => !/mask/i.test(p.name,));
    const maskParam = images.find((p,) => /mask/i.test(p.name,));
    const assetId = sourceParam ? request.params[sourceParam.name] : undefined;
    if (typeof assetId !== "string" || assetId === "") {
      throw new Error("honkbox image edit requires an input image parameter",);
    }

    opts.onProgress?.({ status: "pending", message: "Preparing honkbox edit...", },);
    const image = await imageBytes(database, uploadDir, assetId, opts.ownerId, request.chatId, sourceParam!.name,);
    const maskId = maskParam ? request.params[maskParam.name] : undefined;
    const mask = typeof maskId === "string" && maskId
      ? await imageBytes(database, uploadDir, maskId, opts.ownerId, request.chatId, maskParam!.name,)
      : undefined;

    opts.onProgress?.({ status: "running", message: "Submitting to honkbox...", },);
    const response = await (this.opts.post ?? postEdit)(
      editsUrl(this.opts.baseUrl,),
      buildHonkboxEditForm({ image, mask, params: request.params, },),
      this.opts.apiKey,
    );

    const encoded = (response.data ?? []).map((item,) => item.b64_json).filter(
      (value,): value is string => typeof value === "string" && value.length > 0,
    );

    if (encoded.length === 0) { throw new Error("honkbox image edit returned no images",); }

    const results: ImageEditResult[] = [];
    for (const [index, b64,] of encoded.entries()) {
      const buffer = Buffer.from(b64, "base64",);
      const ext = extractImageMetadata(buffer,).format.toLowerCase();
      const filename = `honkbox-edit-${crypto.randomUUID()}-${index}.${ext === "jpeg" ? "jpg" : ext}`;
      const { asset, } = await createAsset({
        database,
        input: {
          ownerId: opts.ownerId,
          filename,
          mimeType: `image/${ext === "jpeg" ? "jpeg" : ext}`,
          assetType: "image",
          sizeBytes: buffer.length,
          buffer,
          altText: `Honkbox ${template.name}`,
          dedupe: false,
        },
        uploadDir,
      },);

      if (request.chatId) {
        await linkAsset({
          database,
          assetId: asset.id,
          link: { entityType: "chat", entityId: request.chatId, label: template.name, },
        },);
      }

      if (request.messageId) {
        await linkAsset({
          database,
          assetId: asset.id,
          link: { entityType: "message", entityId: request.messageId, label: template.name, },
        },);
      }

      results.push({
        id: asset.id,
        filename: asset.filename,
        url: `/api/v1/assets/${asset.id}/raw`,
        mimeType: asset.mime_type,
      },);
    }

    opts.onProgress?.({ status: "completed", progress: 1, },);
    return results;
  }
}
