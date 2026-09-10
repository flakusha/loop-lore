// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Host model catalog — frontend mirror of the server manifest's model
 * entries (`src/inference/manifest.ts`; mirrored, never imported, so the
 * frontend bundle stays server-free).
 *
 * @module alpine/model-catalog
 */
import { apiFetch, } from "./htmx";

/** One downloadable model file as served by GET /api/local-inference/manifest. */
export interface CatalogModelFile {
  name: string;
  url: string;
  sizeBytes?: number;
  sha256?: string;
}

/** Catalog entry as served by GET /api/local-inference/manifest. */
export interface CatalogModel {
  id: string;
  label: string;
  engine: string;
  parameters: string;
  quantization: string;
  files: CatalogModelFile[];
}

/**
 * Fetch catalog models from the static manifest endpoint.
 * @param fetchImpl - Request seam (defaults to apiFetch).
 * @returns Manifest catalog models (empty when the shape is unknown).
 */
export async function fetchCatalog(
  fetchImpl: (url: string,) => Promise<Response> = apiFetch,
): Promise<CatalogModel[]> {
  const res = await fetchImpl("/api/local-inference/manifest",);
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
