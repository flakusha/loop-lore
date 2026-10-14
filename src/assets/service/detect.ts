// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Asset Service — MIME/type detection
 */
import { AssetType, } from "../../db/enums";
import type { AssetType as AssetTypeT, } from "../../db/enums";

/**
 * Detect asset type from MIME type.
 * @param mime
 * @returns string
 */
export function detectAssetType(mime: string,): AssetTypeT {
  if (mime.startsWith("image/",)) { return AssetType.Image; }
  if (mime.startsWith("audio/",)) { return AssetType.Audio; }
  if (mime.startsWith("video/",)) { return AssetType.Video; }
  return AssetType.Other;
}

/** Extension → MIME type for the common asset formats. */
const MIME_MAP: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
  svg: "image/svg+xml",
  ogg: "audio/ogg",
  opus: "audio/opus",
  mp3: "audio/mpeg",
  flac: "audio/flac",
  wav: "audio/wav",
  webm: "video/webm",
  mp4: "video/mp4",
  mkv: "video/x-matroska",
  pdf: "application/pdf",
  json: "application/json",
  txt: "text/plain",
};

/** MIME type → preferred extension: the inverse of MIME_MAP. */
const EXT_BY_MIME: Record<string, string> = Object.fromEntries(
  Object.entries(MIME_MAP,).map(([ext, mime,],) => [mime, ext,]),
);

/**
 * Detect MIME type from file extension.
 * @param filename
 * @returns void
 */
export function mimeFromExtension(filename: string,): string {
  const ext = filename.split(".",).pop()?.toLowerCase() ?? "";
  return MIME_MAP[ext] ?? "application/octet-stream";
}

/**
 * Preferred file extension for a MIME type (inverse of mimeFromExtension).
 * @param mime - e.g. "image/png"
 * @returns the extension without a dot, or "bin" when the type is unknown
 */
export function extensionForMime(mime: string,): string {
  return EXT_BY_MIME[mime] ?? "bin";
}
