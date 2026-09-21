// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Host model catalog — frontend mirror of the server manifest's model
 * entries (`src/inference/manifest.ts`; mirrored, never imported, so the
 * frontend bundle stays server-free).
 *
 * GGUF split-chunk convention (large llama.cpp models exceed the ~2GB
 * ArrayBuffer cap, so hosts publish them as `llama-gguf-split` parts):
 * `<stem>-<index>-of-<total>.gguf` with 5-digit zero-padded sequence
 * (e.g. `model-00001-of-00003.gguf`), parts sized for parallel fetch
 * (<=512MB class), per-chunk `sizeBytes` + `sha256` verified when present
 * and recorded otherwise (same rule as `model-downloader`). The entry's
 * first chunk (index 1) carries the GGUF header; the downloader probes its
 * magic bytes after the set completes.
 *
 * @module alpine/model-catalog
 */
import { apiFetch, } from "./htmx";

/** One downloadable model file as served by GET /api/v1/local-inference/manifest. */
export interface CatalogModelFile {
  name: string;
  url: string;
  sizeBytes?: number;
  sha256?: string;
}

/** Catalog entry as served by GET /api/v1/local-inference/manifest. */
export interface CatalogModel {
  id: string;
  label: string;
  engine: string;
  parameters: string;
  quantization: string;
  files: CatalogModelFile[];
}

/** Capability subset the model manager gates downloads on. */
export interface LocalInferenceCapability {
  downloadsAllowed: boolean;
}

/**
 * Fetch catalog models from the static manifest endpoint.
 * @param fetchImpl - Request seam (defaults to apiFetch).
 * @returns Manifest catalog models (empty when the shape is unknown).
 */
export async function fetchCatalog(
  fetchImpl: (url: string,) => Promise<Response> = apiFetch,
): Promise<CatalogModel[]> {
  const res = await fetchImpl("/api/v1/local-inference/manifest",);
  if (!res.ok) { throw new Error(`Manifest request failed (${res.status})`,); }
  const payload: unknown = await res.json();
  if (payload && typeof payload === "object" && "models" in payload) {
    const models: unknown = payload.models;
    if (Array.isArray(models,) && models.every(isCatalogModel,)) {
      return models;
    }
  }
  return [];
}

/**
 * Fetch the download capability flag (admin `allowDownloads` default).
 * Fail-open: offline hosts, old servers, and unknown shapes keep current
 * behavior (allowed) — the manifest itself stays fail-closed, since a
 * failed manifest fetch yields an empty catalog with nothing to download.
 * @param fetchImpl - Request seam (defaults to apiFetch).
 * @returns Capability flag; allowed when unknown.
 */
export async function fetchCapability(
  fetchImpl: (url: string,) => Promise<Response> = apiFetch,
): Promise<LocalInferenceCapability> {
  try {
    const res = await fetchImpl("/api/v1/local-inference/capability",);
    if (!res.ok) { return { downloadsAllowed: true, }; }
    const payload: unknown = await res.json();
    if (payload && typeof payload === "object" && "downloadsAllowed" in payload) {
      return { downloadsAllowed: payload.downloadsAllowed !== false, };
    }
  } catch {
    /* offline or unreachable — keep current behavior */
  }
  return { downloadsAllowed: true, };
}

/**
 * Narrow an unknown manifest entry to a catalog model.
 * @param entry - Raw manifest entry.
 * @returns True when the entry has the catalog shape.
 */
export function isCatalogModel(entry: unknown,): entry is CatalogModel {
  if (!entry || typeof entry !== "object") { return false; }
  if (!("id" in entry && typeof entry.id === "string")) { return false; }
  if (!("label" in entry && typeof entry.label === "string")) { return false; }
  if (!("engine" in entry && typeof entry.engine === "string")) { return false; }
  if (!("parameters" in entry && typeof entry.parameters === "string")) { return false; }
  if (!("quantization" in entry && typeof entry.quantization === "string")) { return false; }
  if (!("files" in entry && Array.isArray(entry.files,))) { return false; }
  return entry.files.every(isCatalogFile,);
}

/**
 * Narrow an unknown file entry to a catalog model file.
 * @param entry - Raw file entry.
 * @returns True when name/url are strings and optional fields match.
 */
function isCatalogFile(entry: unknown,): entry is CatalogModelFile {
  if (!entry || typeof entry !== "object") { return false; }
  if (!("name" in entry && typeof entry.name === "string")) { return false; }
  if (!("url" in entry && typeof entry.url === "string")) { return false; }
  if ("sizeBytes" in entry && typeof entry.sizeBytes !== "number") { return false; }
  if ("sha256" in entry && typeof entry.sha256 !== "string") { return false; }
  return true;
}

/**
 * Sum known per-file sizes.
 * @param model - Catalog entry.
 * @returns Total bytes, or undefined when any file size is unknown.
 */
export function catalogTotalBytes(model: CatalogModel,): number | undefined {
  let total = 0;
  for (const file of model.files) {
    if (file.sizeBytes === undefined) { return undefined; }
    total += file.sizeBytes;
  }
  return total;
}

/** One parsed GGUF split-chunk file name. */
export interface GgufSplitPart {
  stem: string;
  index: number;
  total: number;
}

/** `<stem>-<index>-of-<total>.gguf`, 5-digit zero-padded sequence. */
const SPLIT_NAME = /^(.*)-(\d{5})-of-(\d{5})\.gguf$/;

/**
 * Parse a GGUF split-chunk file name.
 * @param name - File name to parse.
 * @returns Stem/index/total, or null when not a chunk name.
 */
export function parseGgufSplitName(name: string,): GgufSplitPart | null {
  const match = SPLIT_NAME.exec(name,);
  if (!match) { return null; }
  const [, stem, indexText, totalText,] = match;
  if (!stem || !indexText || !totalText) { return null; }
  const index = Number(indexText,);
  const total = Number(totalText,);
  if (!Number.isInteger(index,) || !Number.isInteger(total,)) { return null; }
  if (total < 1 || index < 1 || index > total) { return null; }
  return { stem, index, total, };
}

/**
 * Whether every file of an entry is a chunk of one GGUF split set.
 * @param model - Catalog entry.
 * @returns True for a non-empty, single-stem chunk family.
 */
export function isGgufSplitEntry(model: CatalogModel,): boolean {
  if (model.files.length === 0) { return false; }
  const first = parseGgufSplitName(model.files[0]?.name ?? "",);
  if (!first) { return false; }
  return model.files.every((file,) => {
    const part = parseGgufSplitName(file.name,);
    return part !== null && part.stem === first.stem && part.total === first.total;
  },);
}

/**
 * Order an entry's chunk files 1..total for download.
 * @param model - Catalog entry.
 * @returns Chunk files in assembly order, or null when the set is
 * incomplete, duplicated, or not a split entry.
 */
export function orderSplitFiles(model: CatalogModel,): CatalogModelFile[] | null {
  if (!isGgufSplitEntry(model,)) { return null; }
  const byIndex = new Map<number, CatalogModelFile>();
  let total = 0;
  for (const file of model.files) {
    const part = parseGgufSplitName(file.name,);
    if (!part) { return null; }
    total = part.total;
    if (byIndex.has(part.index,)) { return null; }
    byIndex.set(part.index, file,);
  }
  if (byIndex.size !== total) { return null; }
  const ordered: CatalogModelFile[] = [];
  for (let index = 1; index <= total; index++) {
    const file = byIndex.get(index,);
    if (!file) { return null; }
    ordered.push(file,);
  }
  return ordered;
}

/** GGUF magic bytes ("GGUF") opening the first split chunk. */
const GGUF_MAGIC = [0x47, 0x47, 0x55, 0x46,] as const;

/**
 * Whether a byte prefix opens with the GGUF magic.
 * @param prefix - Leading bytes of the first split chunk.
 * @returns True for the 4-byte GGUF magic.
 */
export function isGgufMagic(prefix: Uint8Array,): boolean {
  if (prefix.length < GGUF_MAGIC.length) { return false; }
  return GGUF_MAGIC.every((byte, at,) => prefix[at] === byte);
}
