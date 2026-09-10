// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser model downloader — fetch with Range resume, progress, and SHA-256
 * verification (BYOK local-models slice).
 *
 * Source of truth for integrity is the caller-supplied `expectedSha256`
 * (hex), taken from the host-published model manifest. Resume reuses a
 * previously stored prefix (see `model-storage.ts`): the downloader sends
 * `Range: bytes=<prefix>-` and appends a 206 body, or restarts when the
 * server answers 200. Anything else throws — callers fall back to retry or
 * the server provider, never to a half-verified blob.
 *
 * @module alpine/model-downloader
 */

/** Progress snapshot for download UI. */
export interface DownloadProgress {
  loadedBytes: number;
  totalBytes: number | undefined;
}

/** Options for {@link downloadModel}. */
export interface DownloadOpts {
  url: string;
  /** Expected SHA-256 (hex). Verified when present; required in production. */
  expectedSha256?: string;
  /** Expected total size. Verified when present. */
  sizeBytes?: number;
  /** Hard cap on accepted bytes (default 1 GiB). */
  maxBytes?: number;
  /** Previously stored prefix for Range resume. */
  resumeFrom?: Uint8Array;
  signal?: AbortSignal;
  onProgress?: (progress: DownloadProgress,) => void;
  /** Test seam (defaults to global fetch). */
  fetchImpl?: typeof fetch;
  /** Test seam (defaults to global crypto.subtle). */
  subtle?: SubtleCrypto;
}

/** Default download cap: 1 GiB (largest catalog model is ~500 MB). */
export const DEFAULT_MAX_BYTES = 1_073_741_824;

/** HTTP failure or unreadable body. */
export class DownloadFailedError extends Error {
  readonly status: number;
  constructor(url: string, status: number,) {
    super(`Download failed: ${url} (${status})`,);
    this.name = "DownloadFailedError";
    this.status = status;
  }
}

/** Size or checksum mismatch — the blob MUST NOT be used. */
export class DownloadIntegrityError extends Error {
  constructor(reason: string,) {
    super(`Download integrity check failed: ${reason}`,);
    this.name = "DownloadIntegrityError";
  }
}

/**
 * SHA-256 hex digest.
 * @param data - Bytes to hash.
 * @param subtle - WebCrypto provider (defaults to global).
 * @returns Lowercase hex digest.
 */
export async function sha256Hex(data: Uint8Array, subtle?: SubtleCrypto,): Promise<string> {
  const provider = subtle ?? crypto.subtle;
  const digest = await provider.digest("SHA-256", data as Uint8Array<ArrayBuffer>,);
  return Array.from(new Uint8Array(digest,), (byte,) => byte.toString(16,).padStart(2, "0",),).join("",);
}

/**
 * Parse a `Content-Range: bytes <start>-<end>/<total>` total.
 * @param header - Raw header value or null.
 * @returns Total size, or undefined when unparseable.
 */
export function parseContentRangeTotal(header: string | null,): number | undefined {
  if (!header) { return undefined; }
  const match = /bytes \d+-\d+\/(\d+)/.exec(header,);
  return match ? Number(match[1],) : undefined;
}

/**
 * Download a model blob with resume and integrity verification.
 * @param opts - URL, expectations, and seams.
 * @returns Verified bytes (prefix + fresh body).
 * @throws {DownloadFailedError} On HTTP failure.
 * @throws {DownloadIntegrityError} On size/checksum mismatch or over-cap bytes.
 */
export async function downloadModel(opts: DownloadOpts,): Promise<Uint8Array> {
  const {
    url,
    expectedSha256,
    sizeBytes,
    maxBytes = DEFAULT_MAX_BYTES,
    resumeFrom,
    signal,
    onProgress,
    fetchImpl = fetch,
    subtle,
  } = opts;
  const prefixLength = resumeFrom?.length ?? 0;
  const headers: Record<string, string> = {};
  if (prefixLength > 0) { headers.Range = `bytes=${prefixLength}-`; }

  const response = await fetchImpl(url, { headers, signal, },);
  let prefix = resumeFrom ?? new Uint8Array(0,);
  if (response.status === 206) {
    // Resume accepted — total comes from Content-Range, not Content-Length.
    const total = parseContentRangeTotal(response.headers.get("Content-Range",),) ?? sizeBytes;
    const body = await readBody(response, prefixLength, maxBytes, total, onProgress,);
    prefix = concat(prefix, body,);
  } else if (response.status === 200) {
    // Server ignored Range — restart from scratch.
    prefix = new Uint8Array(0,);
    const total = contentLength(response,) ?? sizeBytes;
    prefix = await readBody(response, 0, maxBytes, total, onProgress,);
  } else if (response.status === 416 && prefixLength > 0) {
    // Prefix already covers the whole object — verify it as-is.
  } else {
    throw new DownloadFailedError(url, response.status,);
  }

  if (prefix.length > maxBytes) {
    throw new DownloadIntegrityError(`size ${prefix.length} exceeds cap ${maxBytes}`,);
  }
  if (sizeBytes !== undefined && prefix.length !== sizeBytes) {
    throw new DownloadIntegrityError(`size ${prefix.length} !== expected ${sizeBytes}`,);
  }
  if (expectedSha256 !== undefined) {
    const actual = await sha256Hex(prefix, subtle,);
    if (actual !== expectedSha256.toLowerCase()) {
      throw new DownloadIntegrityError("SHA-256 mismatch",);
    }
  }
  return prefix;
}

/**
 * @param response
 */
function contentLength(response: Response,): number | undefined {
  const raw = response.headers.get("Content-Length",);
  const parsed = raw === null ? Number.NaN : Number(raw,);
  return Number.isSafeInteger(parsed,) && parsed >= 0 ? parsed : undefined;
}

/**
 * Stream a response body with cap and progress enforcement.
 * @param response
 * @param offset
 * @param maxBytes
 * @param total
 * @param onProgress
 */
async function readBody(
  response: Response,
  offset: number,
  maxBytes: number,
  total: number | undefined,
  onProgress: DownloadOpts["onProgress"],
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let loaded = offset;
  const reader = response.body?.getReader();
  if (!reader) {
    const whole = new Uint8Array(await response.arrayBuffer(),);
    if (offset + whole.length > maxBytes) {
      throw new DownloadIntegrityError(`size exceeds cap ${maxBytes}`,);
    }
    onProgress?.({ loadedBytes: offset + whole.length, totalBytes: total, },);
    return whole;
  }
  for (;;) {
    const { done, value, } = await reader.read();
    if (done) { break; }
    if (value) {
      chunks.push(value,);
      loaded += value.length;
      if (loaded > maxBytes) {
        throw new DownloadIntegrityError(`size exceeds cap ${maxBytes}`,);
      }
      onProgress?.({ loadedBytes: loaded, totalBytes: total, },);
    }
  }
  return concat(new Uint8Array(0,), ...chunks,);
}

/**
 * @param parts
 */
function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part,) => sum + part.length, 0,);
  const out = new Uint8Array(total,);
  let at = 0;
  for (const part of parts) {
    out.set(part, at,);
    at += part.length;
  }
  return out;
}
