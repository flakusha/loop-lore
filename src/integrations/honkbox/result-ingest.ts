// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 500

/**
 * Honkbox job-result ingest.
 *
 * Consumes the liveness SSE feed for one job, recovers a dropped `job_result`
 * against the `/v1/jobs` snapshot, streams the artifact to a temp file, checks
 * size/hash/MIME, then persists and links it through the existing createAsset
 * seam. Cancelled, failed and unrecoverable runs never create an asset row.
 */

import type { Kysely, } from "kysely";
import fs from "node:fs/promises";
import { createAsset, } from "../../assets/service/create";
import { extensionForMime, } from "../../assets/service/detect";
import { linkAsset, } from "../../assets/service/links";
import type { AssetLinkInput, AssetRecord, } from "../../assets/service/types";
import { validateFileSize, validateMimeType, } from "../../assets/service/validate";
import type { AssetType as AssetTypeT, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { jsonParseOr, safeFetch, } from "../../utils";
import {
  cleanupHonkboxArtifact,
  downloadHonkboxArtifactToTempFile,
  honkboxArtifactByteCap,
  HonkboxArtifactDeliveryUnavailableError,
  HonkboxArtifactValidationError,
} from "./artifacts";
import {
  type HonkboxProbeResult,
  isHonkboxFeatureEnabled,
  normalizeHonkboxBaseUrl,
} from "./capabilities";

/** Jobs snapshot, relative to the `/v1`-inclusive base URL. */
const HONKBOX_JOBS_PATH = "/jobs";

/** One NSFW annotation attached to a honkbox job result (`JobEvent.annotations`). */
export interface HonkboxNsfwAnnotation {
  readonly score: number;
  readonly classes: readonly string[];
  readonly modelVersion: string;
}

/** One parsed honkbox job frame (SSE data or a `/v1/jobs` row). */
export interface HonkboxJobEvent {
  readonly event: string;
  readonly id?: string;
  readonly kind?: string;
  readonly cancelled: boolean;
  readonly step?: number;
  readonly totalSteps?: number;
  readonly pct?: number;
  readonly artifactId?: string;
  readonly sha256?: string;
  readonly sizeBytes?: number;
  readonly status?: string;
  /** NSFW annotations on an artifact-less `job_result` re-emit. */
  readonly annotations?: readonly HonkboxNsfwAnnotation[];
}

/** Options for {@link selectHonkboxArtifact}. */
export interface SelectHonkboxArtifactOptions {
  /** Explicit artifact id requested by the caller; wins over emission order. */
  readonly artifactId?: string;
}

/** Select one result frame from a job's `job_result` frames.
 * An explicit id match wins; otherwise the first result frame wins.
 * @param frames - result frames in emission order
 * @param opts - optional explicit artifact id
 * @returns the selected frame, or undefined when no result frame is available
 */
export function selectHonkboxArtifact(
  frames: readonly HonkboxJobEvent[],
  opts: SelectHonkboxArtifactOptions = {},
): HonkboxJobEvent | undefined {
  let first: HonkboxJobEvent | undefined;
  for (const frame of frames) {
    if (frame.event !== "job_result" || !frame.artifactId) { continue; }
    if (opts.artifactId === frame.artifactId) { return frame; }
    first ??= frame;
  }

  return first;
}

/** @param value - unknown JSON value
 * @returns an object view, or undefined
 */
function asRecord(value: unknown,): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value,)
    ? value as Record<string, unknown>
    : undefined;
}

/** @param value - unknown JSON scalar
 * @returns a finite number, or undefined
 */
function asFiniteNumber(value: unknown,): number | undefined {
  return typeof value === "number" && Number.isFinite(value,) ? value : undefined;
}

/** @param value - unknown JSON scalar
 * @returns a non-empty string, or undefined
 */
function asText(value: unknown,): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** @param value - unknown JSON value
 * @returns parsed annotations, dropping malformed entries; never throws
 */
function parseHonkboxAnnotations(value: unknown,): HonkboxNsfwAnnotation[] | undefined {
  if (!Array.isArray(value,)) { return undefined; }
  const annotations: HonkboxNsfwAnnotation[] = [];
  for (const entry of value) {
    const row = asRecord(entry,);
    if (!row) { continue; }
    const score = asFiniteNumber(row.score,);
    const modelVersion = asText(row.model_version,) ?? asText(row.modelVersion,);
    if (score === undefined || score < 0 || score > 1 || modelVersion === undefined) { continue; }
    const classes = Array.isArray(row.classes,)
      ? row.classes.flatMap((value,): string[] => {
        const text = asText(value,);
        return text ? [text,] : [];
      },)
      : [];

    annotations.push({ score, classes, modelVersion, },);
  }

  return annotations;
}

/** Parse one job frame. Missing optional fields stay absent; never throws.
 * @param value - decoded JSON value (SSE `data` payload or a jobs row)
 * @param fallbackEvent - SSE `event:` line when the payload omits `event`
 * @returns the parsed event, or undefined for a non-object payload
 */
export function parseHonkboxJobEvent(
  value: unknown,
  fallbackEvent?: string,
): HonkboxJobEvent | undefined {
  const row = asRecord(value,);
  if (!row) { return undefined; }

  const artifactId = asText(row.artifact_id,) ?? asText(row.artifactId,);
  const sha256 = asText(row.sha256,);
  const sizeBytes = asFiniteNumber(row.size_bytes,) ?? asFiniteNumber(row.sizeBytes,);
  const annotations = parseHonkboxAnnotations(row.annotations,);
  if (
    !artifactId && !sha256 && sizeBytes === undefined &&
    row.event === "job_result" && !annotations?.length
  ) {
    // No artifact and no annotations is not a result — never a success.
    // Annotation-only re-emits are carriers, never asset candidates.
    return undefined;
  }

  return {
    event: asText(row.event,) ?? fallbackEvent ?? "",
    ...(asText(row.id,) ? { id: asText(row.id,), } : {}),
    ...(asText(row.kind,) ? { kind: asText(row.kind,), } : {}),
    cancelled: row.cancelled === true,
    ...(asFiniteNumber(row.step,) === undefined ? {} : { step: asFiniteNumber(row.step,), }),
    ...(asFiniteNumber(row.total_steps,) === undefined
      ? {}
      : { totalSteps: asFiniteNumber(row.total_steps,), }),
    ...(asFiniteNumber(row.pct,) === undefined ? {} : { pct: asFiniteNumber(row.pct,), }),
    ...(artifactId ? { artifactId, } : {}),
    ...(sha256 ? { sha256, } : {}),
    ...(sizeBytes === undefined ? {} : { sizeBytes, }),
    ...(asText(row.status,) ? { status: asText(row.status,), } : {}),
    ...(annotations?.length ? { annotations, } : {}),
  };
}

/** One SSE envelope split into its two lines. */
interface SseEnvelope {
  readonly event: string;
  readonly data: string;
}

/** @param frame - raw SSE frame text
 * @returns the event label and concatenated data lines
 */
function parseSseEnvelope(frame: string,): SseEnvelope {
  const lines = frame.split("\n",).map((line,) => line.trimEnd());
  const event = lines.find((line,) => line.startsWith("event:",))?.slice(6,).trim() ?? "";
  const data = lines
    .filter((line,) => line.startsWith("data:",))
    .map((line,) => line.slice(5,).trimStart())
    .join("\n",);

  return { event, data, };
}

/** Read a live SSE response frame by frame, mirroring the CLI reader.
 * @param response - live event-stream response
 * @yields one envelope per blank-line-delimited frame
 */
async function* readHonkboxFrames(response: Response,): AsyncGenerator<SseEnvelope> {
  if (!response.body) { return; }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { done, value, } = await reader.read();
      if (done) { break; }
      buf += decoder.decode(value, { stream: true, },);
      let idx: number;
      while ((idx = buf.indexOf("\n\n",)) >= 0) {
        const frame = buf.slice(0, idx,);
        buf = buf.slice(idx + 2,);
        yield parseSseEnvelope(frame,);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** Options for {@link ingestHonkboxJobResult}. */
export interface IngestHonkboxJobResultOptions {
  /** `/v1`-inclusive honkbox base URL. */
  readonly baseUrl: string;
  /** Bearer credential, never surfaced in results or errors. */
  readonly apiKey?: string;
  /** Setup probe; artifact delivery and local storage must both be present. */
  readonly probe: HonkboxProbeResult | undefined;
  /** Live response returned by `openHonkboxEventStream`. */
  readonly events: Response;
  /** Registry id of the job whose result is being ingested. */
  readonly jobId: string;
  /** Artifact id to select when a job emits several results. */
  readonly artifactId?: string;
  /** Asset store database. */
  readonly database: Kysely<DB>;
  /** Asset upload directory. */
  readonly uploadDir: string;
  /** Owner of the resulting asset row. */
  readonly ownerId: string;
  /** Entity links applied to the resulting asset (chat and message). */
  readonly links: readonly AssetLinkInput[];
  /** Optional cancellation signal for the download. */
  readonly signal?: AbortSignal;
  /** Optional jobs-snapshot override for reconciliation. */
  readonly listJobs?: () => Promise<unknown>;
  /** Optional progress sink for `job_progress` frames. */
  readonly onProgress?: (event: HonkboxJobEvent,) => void;
  /** Optional sink for NSFW annotations on artifact-less result frames. */
  readonly onAnnotations?: (
    annotations: readonly HonkboxNsfwAnnotation[],
    event: HonkboxJobEvent,
  ) => void;
}

/** Outcome of one ingest attempt. Errors (capability, transport, integrity)
 * throw; ordinary non-success job outcomes return `ok: false` with a reason. */
export type IngestHonkboxJobResultOutcome =
  | {
    ok: true;
    asset: AssetRecord;
    artifactId: string;
    sha256: string;
    sizeBytes: number;
    readonly annotations: readonly HonkboxNsfwAnnotation[];
  }
  | { ok: false; reason: "cancelled" | "failed" | "no-result"; detail: string };

/** Fail closed before any I/O when the honkbox side lacks the prereqs.
 * @param opts - ingest options
 * @returns {void}
 * @throws {HonkboxArtifactDeliveryUnavailableError}
 */
function assertDeliveryEnabled(opts: IngestHonkboxJobResultOptions,): void {
  if (!isHonkboxFeatureEnabled(opts.probe, "artifactDelivery",)) {
    throw new HonkboxArtifactDeliveryUnavailableError(
      "honkbox capability artifactDelivery is not available",
    );
  }

  if (!opts.probe?.ok || !opts.probe.supported || !opts.probe.capabilities.storage.dataDirPresent) {
    throw new HonkboxArtifactDeliveryUnavailableError(
      "honkbox storage.data_dir_present is false",
    );
  }
}

/** @param opts - ingest options
 * @returns the current jobs snapshot
 */
async function jobsSnapshot(opts: IngestHonkboxJobResultOptions,): Promise<unknown> {
  if (opts.listJobs) { return await opts.listJobs(); }
  const base = normalizeHonkboxBaseUrl(opts.baseUrl,);
  const result = await safeFetch<unknown>(`${base}${HONKBOX_JOBS_PATH}`, {
    handle401: false,
    ...(opts.apiKey ? { headers: { Authorization: `Bearer ${opts.apiKey}`, }, } : {}),
  },);

  if (!result.ok) {
    throw new Error(`honkbox jobs reconciliation failed: ${result.error.message}`,);
  }

  return result.data;
}

/** Recover a dropped result from the current-state snapshot.
 * @param opts - ingest options
 * @returns a result event, or undefined when no result is discoverable
 */
async function reconcileJobResult(
  opts: IngestHonkboxJobResultOptions,
): Promise<HonkboxJobEvent | undefined> {
  const snapshot = await jobsSnapshot(opts,);
  const doc = asRecord(snapshot,);
  const candidates: unknown = Array.isArray(snapshot,)
    ? snapshot
    : doc && Array.isArray(doc.data,)
    ? doc.data
    : doc && Array.isArray(doc.jobs,)
    ? doc.jobs
    : [];

  const rows = candidates as unknown[];
  const row = rows.find((entry,) => asRecord(entry,)?.id === opts.jobId);
  const event = parseHonkboxJobEvent(row, "job_result",);
  return event?.event === "job_result" && event.artifactId ? event : undefined;
}

/** Consume one honkbox job's SSE frames, download and ingest its artifact.
 * @param opts - connection, probe, stream and asset-store settings
 * @returns the persisted asset, or a structured non-success job outcome
 */
export async function ingestHonkboxJobResult(
  opts: IngestHonkboxJobResultOptions,
): Promise<IngestHonkboxJobResultOutcome> {
  assertDeliveryEnabled(opts,);

  const frames: HonkboxJobEvent[] = [];
  const annotations: HonkboxNsfwAnnotation[] = [];
  let dropped = false;
  for await (const envelope of readHonkboxFrames(opts.events,)) {
    if (envelope.event === "events_dropped") {
      dropped = true;
      continue;
    }

    const payload: unknown = envelope.data ? jsonParseOr<unknown>(envelope.data, undefined,) : undefined;

    const event = parseHonkboxJobEvent(payload, envelope.event,);
    if (!event) { continue; }
    if (event.id && event.id !== opts.jobId) { continue; }

    if (event.event === "job_cancelled" || (event.cancelled && event.event === "job_finished")) {
      return { ok: false, reason: "cancelled", detail: `job ${opts.jobId} was cancelled`, };
    }

    if (
      event.event === "job_finished" &&
      (event.status === "failed" || event.status === "error")
    ) {
      return { ok: false, reason: "failed", detail: `job ${opts.jobId} failed`, };
    }

    if (event.event === "job_result" && event.artifactId) { frames.push(event,); }
    if (event.annotations?.length) {
      annotations.push(...event.annotations,);
      opts.onAnnotations?.(event.annotations, event,);
    }

    if (event.event === "job_progress") { opts.onProgress?.(event,); }
    if (event.event === "job_finished") { break; }
  }

  let result = selectHonkboxArtifact(frames, { artifactId: opts.artifactId, },);

  // A gap frame or a missing result means the snapshot is authoritative — a
  // missed result is never reported as a successful ingest.
  if (dropped || !result) {
    const recovered = await reconcileJobResult(opts,);
    if (recovered) { result = recovered; }
  }

  if (!result?.artifactId) {
    return {
      ok: false,
      reason: "no-result",
      detail: `no artifact result recovered for job ${opts.jobId}`,
    };
  }

  const capabilities = opts.probe?.ok && opts.probe.supported ? opts.probe.capabilities : undefined;
  if (!capabilities) {
    throw new HonkboxArtifactDeliveryUnavailableError("honkbox capabilities are unavailable",);
  }

  const client = {
    baseUrl: opts.baseUrl,
    ...(opts.apiKey ? { apiKey: opts.apiKey, } : {}),
    maxBytes: honkboxArtifactByteCap(capabilities,),
  };

  const downloaded = await downloadHonkboxArtifactToTempFile(
    client,
    result.artifactId,
    opts.signal,
  );

  try {
    // ponytail: createAsset still takes a Buffer, so the staged file is read
    // once here; add a streaming store seam when GLBs outgrow the byte cap.
    const bytes = await fs.readFile(downloaded.path,);
    if (bytes.byteLength !== downloaded.sizeBytes) {
      throw new HonkboxArtifactValidationError("staged artifact size changed while reading",);
    }

    if (result.sizeBytes !== undefined && result.sizeBytes !== bytes.byteLength) {
      throw new HonkboxArtifactValidationError(
        `artifact size ${String(bytes.byteLength,)} does not match result ${String(result.sizeBytes,)}`,
      );
    }

    if (result.sha256 && result.sha256.toLowerCase() !== downloaded.sha256) {
      throw new HonkboxArtifactValidationError("artifact sha256 does not match job_result",);
    }

    const mimeType = downloaded.contentType.split(";", 1,)[0]!.trim().toLowerCase();
    const mimeError = validateMimeType(mimeType,);
    if (mimeError) { throw new HonkboxArtifactValidationError(mimeError,); }
    const sizeError = validateFileSize(bytes.byteLength, client.maxBytes,);
    if (sizeError) { throw new HonkboxArtifactValidationError(sizeError,); }

    const assetType: AssetTypeT = mimeType.startsWith("image/",)
      ? "image"
      : mimeType.startsWith("model/",)
      ? "model"
      : "other";

    const ext = mimeType === "model/gltf-binary" ? "glb" : extensionForMime(mimeType,);
    const { asset, } = await createAsset({
      database: opts.database,
      uploadDir: opts.uploadDir,
      input: {
        ownerId: opts.ownerId,
        filename: `${downloaded.sha256}.${ext}`,
        mimeType,
        assetType,
        sizeBytes: bytes.byteLength,
        buffer: bytes,
        contentHash: downloaded.sha256,
        dedupe: false,
        altText: `honkbox artifact ${result.artifactId}`,
      },
    },);

    for (const link of opts.links) {
      await linkAsset({ database: opts.database, assetId: asset.id, link, },);
    }

    return {
      ok: true,
      asset,
      artifactId: result.artifactId,
      sha256: downloaded.sha256,
      sizeBytes: bytes.byteLength,
      annotations,
    };
  } finally {
    await cleanupHonkboxArtifact(downloaded,);
  }
}
