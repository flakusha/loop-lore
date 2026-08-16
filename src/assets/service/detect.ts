// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Asset Service — MIME/type detection
 */
import { AssetType, } from "../../db/enums";
import type { AssetType as AssetTypeT, } from "../../db/enums";

/**
 * Detect asset type from MIME type.
 */
export function detectAssetType(mime: string,): AssetTypeT {
  if (mime.startsWith("image/",)) { return AssetType.Image; }
  if (mime.startsWith("audio/",)) { return AssetType.Audio; }
  if (mime.startsWith("video/",)) { return AssetType.Video; }
  return AssetType.Other;
}

/**
 * Detect MIME type from file extension.
 */
export function mimeFromExtension(filename: string,): string {
  const ext = filename.split(".",).pop()?.toLowerCase() ?? "";
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
  return MIME_MAP[ext] ?? "application/octet-stream";
}
