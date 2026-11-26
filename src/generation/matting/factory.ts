// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Matting — provider factory.
 *
 * Resolves a `MattingProvider` from the `generation.matting` config section.
 * Pure construction only — no network probes here. `auto` consults the
 * already-cached honkbox capabilities (never probes) and prefers honkbox when
 * its matting sidecar is advertised. ComfyUI node capability is verified
 * lazily on first matting call (`hasMattingNodes`), so an outdated ComfyUI
 * degrades to a failed job, never to a broken cut-out.
 */
import { randomUUID, } from "node:crypto";
import sharp from "sharp";
import type { Config, MattingConfig, } from "../../config/schema";
import { pickSdProvider, } from "../../config/schema";
import { ImageApiFamily, } from "../../db/enums";
import {
  type HonkboxProbeResult,
  peekHonkboxCapabilities,
} from "../../integrations/honkbox/capabilities";
import { honkboxChatBaseUrl, } from "../../integrations/honkbox/provider-config";
import { getLogger, } from "../../logger";
import { proxyForUrl, safeFetch, safeJsonStringify, } from "../../utils";
import { safeFromUint8Array, } from "../../utils/safe-buffer";
import { ComfyUIClient, } from "../providers/comfyui";
import { createComfyMattingProvider, } from "./comfy-provider";
import {
  createHttpMattingProvider,
  createRembgMattingProvider,
  looksLikePng,
} from "./providers";
import type { MattingProvider, } from "./types";

/**
 * Pick the comfyui-family SD provider to execute matting with.
 * @param config - server config
 * @returns client factory inputs, or null when no comfy provider is set
 */
function resolveComfyClient(config: Config,): ComfyUIClient | null {
  const comfyProviders = (config.generation.providers.sd ?? []).filter(
    (provider,) => provider.apiFamily === ImageApiFamily.Comfyui,
  );

  const provider = pickSdProvider(comfyProviders, "edit",);
  if (!provider) { return null; }
  return new ComfyUIClient({
    baseUrl: provider.baseUrl,
    timeout: provider.generationTimeout,
    pollIntervalMs: 500,
  },);
}

/** Cached probe for the configured honkbox; never opens a socket. */
function cachedHonkboxProbe(): HonkboxProbeResult | undefined {
  const baseUrl = process.env.HONKBOX_BASE_URL;
  if (!baseUrl) { return undefined; }
  return peekHonkboxCapabilities(baseUrl, process.env.HONKBOX_API_KEY,);
}

/** @param probe - cached honkbox capabilities, if any
 * @returns true only while the matting sidecar is advertised
 */
function honkboxMattingAvailable(probe: HonkboxProbeResult | undefined,): boolean {
  return probe?.ok === true && probe.supported &&
    probe.capabilities.imageOps?.mattingAvailable === true;
}

/** Matting through honkbox `POST /v1/image-ops` (`"matting"` command). */
function createHonkboxMattingProvider(opts: {
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
},): MattingProvider {
  const url = `${honkboxChatBaseUrl(opts.baseUrl,)}/image-ops`;
  return {
    name: "honkbox",
    async removeBackground(buffer: Buffer,): Promise<Buffer> {
      const png = looksLikePng(buffer,) ? buffer : await sharp(buffer,).png().toBuffer();

      const body = safeJsonStringify({
        command: "matting",
        inputs: [{ data_uri: `data:image/png;base64,${png.toString("base64",)}`, },],
        client: "loop-lore-matting",
        request_id: randomUUID(),
      },);

      const result = await safeFetch<{ outputs?: Array<{ b64_json?: string }> }>(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}`, } : {}),
        },
        body: body.ok ? body.value : "{}",
        timeout: opts.timeoutMs ?? 120_000,
        // Base64 PNG payloads exceed safeFetch's default 10MB response cap.
        maxSize: Number.MAX_SAFE_INTEGER,
        handle401: false,
        proxy: proxyForUrl(url,),
      },);

      if (!result.ok) {
        getLogger().warn({
          event: "matting.honkbox_http_error",
          status: result.status,
          detail: result.error.message.slice(0, 200,),
        },);

        throw new Error(`Honkbox matting returned HTTP ${String(result.status ?? 0,)}`,);
      }

      const encoded = result.data.outputs?.[0]?.b64_json;
      if (!encoded) { throw new Error("Honkbox matting returned no image",); }

      const sized = safeFromUint8Array(new Uint8Array(Buffer.from(encoded, "base64",),),);
      if (!sized.ok) { throw sized.error; }

      if (!looksLikePng(sized.buffer,)) {
        throw new Error("Honkbox matting returned a non-PNG payload",);
      }

      return sized.buffer;
    },
  };
}

/**
 * Resolve a matting provider for one backend choice.
 * @param backend - explicit backend selection
 * @param matting - the matting config section
 * @param config - full server config (comfy provider lookup)
 */
function pickBackend(
  backend: MattingConfig["backend"],
  matting: MattingConfig,
  config: Config,
): MattingProvider | null {
  switch (backend) {
    case "http":
      return matting.endpoint
        ? createHttpMattingProvider({
          name: "http",
          endpoint: matting.endpoint,
          apiKey: matting.apiKey,
          timeoutMs: matting.timeoutMs,
        },)
        : null;
    case "rembg":
      return matting.endpoint
        ? createRembgMattingProvider({
          baseUrl: matting.endpoint,
          model: matting.model,
          decontaminate: matting.decontaminate,
          timeoutMs: matting.timeoutMs,
        },)
        : null;
    case "comfy": {
      const client = resolveComfyClient(config,);
      return client
        ? createComfyMattingProvider({ client, model: matting.model, },)
        : null;
    }

    default:
      return null;
  }
}

/**
 * Resolve the configured matting provider.
 * Section absent or `backend: "none"` → null (matting disabled; raw assets
 * stay usable). `backend: "auto"` prefers honkbox when its cached capabilities
 * advertise the matting sidecar, then comfy (when an sd provider with
 * apiFamily "comfyui" is configured), then the rembg sidecar, then the
 * generic HTTP endpoint. An explicit backend always wins.
 * @param config - server config
 * @param honkboxProbe - cached capabilities, injectable so tests touch no globals
 * @returns {MattingProvider | null}
 */
export function resolveMattingProvider(
  config: Config,
  honkboxProbe: HonkboxProbeResult | undefined = cachedHonkboxProbe(),
): MattingProvider | null {
  const matting = config.generation.matting;
  if (!matting || matting.backend === "none") { return null; }

  if (matting.backend === "auto") {
    if (honkboxMattingAvailable(honkboxProbe,)) {
      return createHonkboxMattingProvider({
        baseUrl: process.env.HONKBOX_BASE_URL ?? "",
        apiKey: process.env.HONKBOX_API_KEY,
        timeoutMs: matting.timeoutMs,
      },);
    }

    return (
      pickBackend("comfy", matting, config,) ??
        // rembg shares `endpoint` with the generic http provider; a bare
        // endpoint is treated as http unless a rembg model is pinned.
        (matting.model ? pickBackend("rembg", matting, config,) : null) ??
        pickBackend("http", matting, config,)
    );
  }

  return pickBackend(matting.backend, matting, config,);
}
