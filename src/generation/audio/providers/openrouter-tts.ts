// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * OpenRouter TTS audio provider — POSTs `POST {base}/audio/speech` and
 * returns the raw audio bytes (mp3 by default).
 *
 * The endpoint answers with a BYTE STREAM on success and a JSON error
 * envelope (`{"error": {"code", "message"}}`) on failure — so the body must
 * never be parsed as JSON on the happy path.
 *
 * Defaults come from the environment so the provider needs no config wiring:
 * `BYOK_E2E_API_KEY` (OpenRouter key), `BYOK_E2E_BASE_URL`,
 * `E2E_TTS_MODEL`.
 */
import { safeFetch, safeJsonStringify, } from "../../../utils";
import { safeFromUint8Array, } from "../../../utils/safe-buffer";
import type { AudioGenOutcome, AudioGenRequest, AudioProvider, } from "../types";

/** Default OpenRouter API base. */
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

/** Default TTS model — the free Fish Audio S2.1 Pro variant. */
const DEFAULT_MODEL = "fish-audio/s2.1-pro-free:free";

/**
 * Default Fish Audio voice reference id (verified against the live endpoint).
 * Pass an empty string to omit `voice` and let the provider pick its default.
 */
const DEFAULT_VOICE = "b347db033a6549378b48d00acb0d06cd";

/** Request timeout in ms. */
const DEFAULT_TIMEOUT_MS = 60_000;

/** */
export interface OpenRouterTtsOptions {
  /** OpenRouter API key (default `BYOK_E2E_API_KEY`). */
  apiKey?: string;
  /** API base URL (default `BYOK_E2E_BASE_URL` → the OpenRouter API base). */
  baseUrl?: string;
  /** TTS model id (default `E2E_TTS_MODEL` → the free Fish Audio variant). */
  model?: string;
  /** Voice id; empty string omits the field. */
  voice?: string;
  /** Request timeout in ms (default 60000). */
  timeoutMs?: number;
}

/** The JSON error envelope OpenRouter returns for a failed request. */
interface SpeechErrorBody {
  error?: { code?: number; message?: string };
}

/**
 * Create the OpenRouter TTS audio provider (id "tts:openrouter").
 *
 * The provider is NOT auto-selected by the engine — it is addressed
 * explicitly by id, because ambient/music requests must keep resolving to
 * the ComfyUI or local provider.
 * @param opts
 * @returns The provider; `generate` returns raw mp3 bytes on success.
 */
export function createOpenRouterTtsProvider(opts: OpenRouterTtsOptions = {},): AudioProvider {
  const apiKey = opts.apiKey ?? process.env.BYOK_E2E_API_KEY ?? "";
  const baseUrl = (opts.baseUrl ?? process.env.BYOK_E2E_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "",);
  const model = opts.model ?? process.env.E2E_TTS_MODEL ?? DEFAULT_MODEL;
  const voice = opts.voice ?? process.env.E2E_TTS_VOICE ?? DEFAULT_VOICE;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    id: "tts:openrouter",
    async generate(request: AudioGenRequest,): Promise<AudioGenOutcome> {
      if (!apiKey) {
        return {
          ok: false,
          error: "OpenRouter TTS requires an API key (set BYOK_E2E_API_KEY)",
          status: 500,
        };
      }

      const body = safeJsonStringify({
        model,
        input: request.prompt,
        ...(voice ? { voice, } : {}),
        response_format: "mp3",
      },);

      if (!body.ok) {
        return { ok: false, error: `TTS request could not be serialized: ${body.error.message}`, status: 500, };
      }

      const result = await safeFetch<Response>(`${baseUrl}/audio/speech`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: body.value,
        signal: AbortSignal.timeout(timeoutMs,),
        stream: true,
        includeErrorBody: true,
        handle401: false,
      },);

      if (!result.ok) {
        if (result.status === undefined) {
          return { ok: false, error: `TTS request failed: ${result.error.message}`, status: 502, };
        }

        const bodyValue: unknown = "body" in result.error ? result.error.body : undefined;
        // ponytail: envelope already JSON-parsed by safeFetch; same trust as
        // the old safeJsonParse cast, one named const.
        const errorBody: SpeechErrorBody | undefined = typeof bodyValue === "object" && bodyValue !== null
          ? bodyValue as SpeechErrorBody
          : undefined;

        const code = errorBody?.error?.code;
        const status = typeof code === "number" ? code : result.status;

        if (status === 402) {
          return {
            ok: false,
            error: "Insufficient OpenRouter credits for TTS (add credits at https://openrouter.ai/credits)",
            status: 402,
          };
        }

        const detail = errorBody?.error?.message ?? result.error.message;
        return { ok: false, error: `TTS request failed: ${detail}`, status, };
      }

      // Success body is a raw audio byte stream — never JSON.
      const bytes = safeFromUint8Array(new Uint8Array(await result.data.arrayBuffer(),),);
      if (!bytes.ok) {
        return { ok: false, error: `TTS audio too large: ${bytes.error.message}`, status: 502, };
      }

      const mimeType = result.data.headers.get("content-type",) ?? "audio/mpeg";
      return { ok: true, buffer: bytes.buffer, mimeType, };
    },
  };
}
