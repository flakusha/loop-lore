// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Honkbox artifact-store client.
 *
 * Thin, bearer-authenticated wrapper over `POST /v1/artifacts` and
 * `GET /v1/artifacts/{id}/bytes`. Downloads stream to an OS temp file with a
 * ranged request and an incremental SHA-256, so a large GLB never lands in a
 * single in-memory buffer. All paths are server-derived: no caller-supplied
 * filesystem path is ever accepted, and the bearer key is never returned.
 */

import { createHash, randomUUID, } from "node:crypto";
import fs from "node:fs/promises";
import { join, } from "node:path";
import { appTmpRoot, } from "../../test-utils/tmp-root";
import { safeFetch, } from "../../utils";
import {
  type HonkboxCapabilities,
  normalizeHonkboxBaseUrl,
} from "./capabilities";

/** Artifact collection, relative to the `/v1`-inclusive provider base URL. */
export const HONKBOX_ARTIFACTS_PATH = "/artifacts";

/** Floor used when a probed descriptor carries no positive body-byte limit. */
export const DEFAULT_HONKBOX_ARTIFACT_MAX_BYTES = 64 * 1_048_576;

/** Default request deadline; streams are uncapped by safeFetch's timeout. */
const DEFAULT_ARTIFACT_TIMEOUT_MS = 60_000;

/** Connection settings for one honkbox instance. The key stays inside this
 * object — no returned descriptor, path or error ever carries it. */
export interface HonkboxArtifactClientOptions {
  /** `/v1`-inclusive provider base URL. */
  readonly baseUrl: string;
  /** Bearer credential, when the instance requires one. */
  readonly apiKey?: string;
  /** Hard byte ceiling, derived from the probed capability limits. */
  readonly maxBytes: number;
  /** Bounded-request deadline in milliseconds. */
  readonly timeoutMs?: number;
}

/** Byte cap advertised by a probed honkbox instance.
 * @param capabilities - parsed capabilities descriptor
 * @returns the body-byte limit, or a conservative floor when it is absent
 */
export function honkboxArtifactByteCap(capabilities: HonkboxCapabilities,): number {
  const limit = capabilities.formats.limits.bodyBytes;
  return Number.isFinite(limit,) && limit > 0 ? limit : DEFAULT_HONKBOX_ARTIFACT_MAX_BYTES;
}

/** Raised when a capability flag blocks artifact delivery. Named so callers
 * can fail closed without parsing message strings. */
export class HonkboxArtifactDeliveryUnavailableError extends Error {
  /** */
  constructor(message: string,) {
    super(message,);
    this.name = "HonkboxArtifactDeliveryUnavailableError";
  }
}

/** Raised when a byte cap or an integrity check refuses an artifact. */
export class HonkboxArtifactValidationError extends Error {
  /** */
  constructor(message: string,) {
    super(message,);
    this.name = "HonkboxArtifactValidationError";
  }
}

/** @param client - connection settings
 * @returns the bearer header fragment (empty when unauthenticated)
 */
function authHeader(client: HonkboxArtifactClientOptions,): Record<string, string> {
  return client.apiKey ? { Authorization: `Bearer ${client.apiKey}`, } : {};
}

/** @param client - connection settings
 * @param artifactId - content-addressed artifact id
 * @param suffix - optional route suffix
 * @returns the escaped artifact URL
 * @throws {Error} When the client baseUrl is blank
 */
function artifactUrl(
  client: HonkboxArtifactClientOptions,
  artifactId: string,
  suffix = "",
): string {
  const base = normalizeHonkboxBaseUrl(client.baseUrl,);
  if (!base) { throw new Error("honkbox artifact client needs a non-blank baseUrl",); }
  return `${base}${HONKBOX_ARTIFACTS_PATH}/${encodeURIComponent(artifactId,)}${suffix}`;
}

/** One stored artifact as reported by the honkbox artifact route. */
export interface HonkboxStoredArtifact {
  readonly artifactId: string;
  readonly sha256?: string;
  readonly sizeBytes: number;
}

/** Upload raw bytes in one shot (no chunk protocol on the client side).
 * @param client - connection settings
 * @param bytes - raw artifact body
 * @param contentType - artifact MIME type; parameters are stripped before upload
 * @returns the server-assigned artifact descriptor
 */
export async function putHonkboxArtifact(
  client: HonkboxArtifactClientOptions,
  bytes: Uint8Array,
  contentType: string,
): Promise<HonkboxStoredArtifact> {
  if (bytes.byteLength > client.maxBytes) {
    throw new HonkboxArtifactValidationError(
      `artifact upload exceeds the ${String(client.maxBytes,)} byte cap`,
    );
  }

  const base = normalizeHonkboxBaseUrl(client.baseUrl,);
  if (!base) { throw new Error("honkbox artifact client needs a non-blank baseUrl",); }

  const artifactContentType = contentType.split(";", 1,)[0]!.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(artifactContentType,)) {
    throw new HonkboxArtifactValidationError(`invalid artifact content type: ${contentType}`,);
  }

  const result = await safeFetch<unknown>(`${base}${HONKBOX_ARTIFACTS_PATH}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "x-artifact-content-type": artifactContentType,
      ...authHeader(client,),
    },
    body: bytes,
    maxSize: client.maxBytes,
    timeout: client.timeoutMs ?? DEFAULT_ARTIFACT_TIMEOUT_MS,
    handle401: false,
  },);

  if (!result.ok) {
    throw new Error(`honkbox artifact upload failed: ${result.error.message}`,);
  }

  const doc = typeof result.data === "object" && result.data !== null && !Array.isArray(result.data,)
    ? result.data as Record<string, unknown>
    : undefined;

  const artifactId = typeof doc?.artifact_id === "string" && doc.artifact_id.length > 0
    ? doc.artifact_id
    : undefined;

  if (!artifactId) {
    throw new Error("honkbox artifact upload response has no artifact_id",);
  }

  const sha256 = typeof doc?.sha256 === "string" && doc.sha256.length > 0 ? doc.sha256 : undefined;
  const sizeBytes = typeof doc?.size_bytes === "number" && Number.isFinite(doc.size_bytes,)
    ? doc.size_bytes
    : 0;

  return { artifactId, ...(sha256 ? { sha256, } : {}), sizeBytes, };
}

/** Inclusive byte range requested from the artifact route. */
export interface HonkboxArtifactByteRange {
  readonly start: number;
  readonly endInclusive: number;
}

/** Open `GET /v1/artifacts/{id}/bytes`; the caller owns the live body.
 * @param client - connection settings
 * @param artifactId - content-addressed artifact id
 * @param range - optional inclusive byte range
 * @param signal - optional cancellation signal
 * @returns the unconsumed response
 */
export async function getHonkboxArtifactBytes(
  client: HonkboxArtifactClientOptions,
  artifactId: string,
  range?: HonkboxArtifactByteRange,
  signal?: AbortSignal,
): Promise<Response> {
  const headers = {
    ...authHeader(client,),
    ...(range
      ? { Range: `bytes=${range.start}-${range.endInclusive}`, }
      : {}),
  };

  const result = await safeFetch<Response>(artifactUrl(client, artifactId, "/bytes",), {
    stream: true,
    headers,
    handle401: false,
    ...(signal ? { signal, } : {}),
  },);

  if (!result.ok) {
    throw new Error(`honkbox artifact bytes request failed: ${result.error.message}`,);
  }

  return result.data;
}

/** A downloaded artifact staged on local disk. */
export interface DownloadedHonkboxArtifact {
  /** Server-generated temp path inside a private directory. */
  readonly path: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly contentType: string;
}

/** @param header - `Content-Range` value, if any
 * @returns the advertised total size, or undefined
 */
function rangeTotal(header: string | null,): number | undefined {
  const raw = header?.split("/", 2,)[1];
  const total = raw === undefined ? Number.NaN : Number(raw,);
  return Number.isFinite(total,) && total > 0 ? total : undefined;
}

/** Stream one artifact to a fresh temp file, capped by the probed byte limit.
 * The path is always generated here; callers cannot steer where bytes land.
 * @param client - connection settings
 * @param artifactId - content-addressed artifact id
 * @param signal - optional cancellation signal
 * @returns temp path, byte count and incremental SHA-256
 */
export async function downloadHonkboxArtifactToTempFile(
  client: HonkboxArtifactClientOptions,
  artifactId: string,
  signal?: AbortSignal,
): Promise<DownloadedHonkboxArtifact> {
  const response = await getHonkboxArtifactBytes(
    client,
    artifactId,
    { start: 0, endInclusive: Math.max(0, client.maxBytes - 1,), },
    signal,
  );

  const contentType = response.headers.get("content-type",) ?? "application/octet-stream";
  const total = rangeTotal(response.headers.get("content-range",),);
  if (total !== undefined && total > client.maxBytes) {
    throw new HonkboxArtifactValidationError(
      `artifact of ${String(total,)} bytes exceeds the ${String(client.maxBytes,)} byte cap`,
    );
  }

  if (!response.body) {
    throw new Error("honkbox artifact bytes response has no body",);
  }

  // ponytail: one private temp dir per artifact, removed by the caller after
  // createAsset copies the bytes into the asset store; no caller path accepted.
  const dir = await fs.mkdtemp(join(appTmpRoot("honkbox",), "honkbox-artifact-",),);
  const path = join(dir, `${randomUUID()}.bin`,);
  const handle = await fs.open(path, "wx", 0o600,);
  const hasher = createHash("sha256",);
  const reader = response.body.getReader();
  let position = 0;

  try {
    for (;;) {
      const { done, value, } = await reader.read();
      if (done) { break; }
      if (!value || value.byteLength === 0) { continue; }

      const remaining = client.maxBytes - position;
      if (remaining <= 0) {
        throw new HonkboxArtifactValidationError(
          `artifact exceeds the ${String(client.maxBytes,)} byte cap`,
        );
      }

      const chunk = value.byteLength > remaining ? value.subarray(0, remaining,) : value;
      hasher.update(chunk,);

      let written = 0;
      while (written < chunk.byteLength) {
        const write = await handle.write(chunk, written, chunk.byteLength - written, position + written,);
        if (write.bytesWritten <= 0) { throw new Error("short write staging honkbox artifact",); }
        written += write.bytesWritten;
      }

      position += chunk.byteLength;
    }
  } catch (error) {
    reader.releaseLock();
    await handle.close().catch(() => undefined);
    await fs.rm(dir, { recursive: true, force: true, },).catch(() => undefined);
    throw error;
  }

  reader.releaseLock();
  await handle.close();
  if (position === 0) {
    await fs.rm(dir, { recursive: true, force: true, },);
    throw new HonkboxArtifactValidationError("honkbox artifact download was empty",);
  }

  return { path, sizeBytes: position, sha256: hasher.digest("hex",), contentType, };
}

/** Remove a staged artifact directory once its bytes are persisted.
 * @param downloaded - a download returned by {@link downloadHonkboxArtifactToTempFile}
 * @returns {void}
 */
export async function cleanupHonkboxArtifact(
  downloaded: DownloadedHonkboxArtifact,
): Promise<void> {
  const dir = join(downloaded.path, "..",);
  await fs.rm(dir, { recursive: true, force: true, },);
}
