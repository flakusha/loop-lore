// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Asset Service — MIME/type detection
 */
import { AssetType, } from "../../../../../src/db/enums";
import type { AssetType as AssetTypeT, } from "../../../../../src/db/enums";

/**
 * Detect asset type from MIME type.
 * @param mime
 * @returns string
 */
export function detectAssetType(mime: string,): AssetTypeT {
  if (mime.startsWith("image/",)) { return AssetType.Image; }
  if (mime.startsWith("audio/",)) { return AssetType.Audio; }
  if (mime.startsWith("video/",)) { return AssetType.Video; }
  if (mime.startsWith("model/",)) { return AssetType.Model; }
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
  glb: "model/gltf-binary",
  gltf: "model/gltf+json",
  exr: "image/x-exr",
  ora: "image/openraster",
  ply: "model/ply",
  splat: "model/splat",
  spz: "model/spz",
  obj: "model/obj",
  fbx: "model/fbx",
  usda: "model/usd",
  usdc: "model/usd",
  usdz: "model/usd",
  usd: "model/usd",
  stl: "model/stl",
  "3mf": "model/3mf",
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

const ENCODER = new TextEncoder();
const ascii = (text: string,): Uint8Array => ENCODER.encode(text,);
const raw = (...values: number[]): Uint8Array => new Uint8Array(values,);

/** One leading-byte part: `bytes` must match at `at`. */
interface MagicPart {
  at: number;
  bytes: Uint8Array;
}

/** Ordered signatures — first match wins; SVG stays last so the gate blocks it. */
const MAGIC_ROWS: ReadonlyArray<{ mime: string; parts: readonly MagicPart[] }> = [
  { mime: "model/gltf-binary", parts: [{ at: 0, bytes: ascii("glTF",), },], },
  { mime: "image/x-exr", parts: [{ at: 0, bytes: ascii("v/1\x01",), },], },
  { mime: "model/ply", parts: [{ at: 0, bytes: ascii("ply\n",), },], },
  { mime: "model/spz", parts: [{ at: 0, bytes: ascii("NGSP",), },], },
  { mime: "model/fbx", parts: [{ at: 0, bytes: ascii("Kaydara FBX Binary  \x00\x1a\x00",), },], },
  { mime: "image/png", parts: [{ at: 0, bytes: raw(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,), },], },
  { mime: "image/jpeg", parts: [{ at: 0, bytes: raw(0xff, 0xd8, 0xff,), },], },
  { mime: "image/gif", parts: [{ at: 0, bytes: ascii("GIF87a",), },], },
  { mime: "image/gif", parts: [{ at: 0, bytes: ascii("GIF89a",), },], },
  { mime: "image/webp", parts: [{ at: 0, bytes: ascii("RIFF",), }, { at: 8, bytes: ascii("WEBP",), },], },
  { mime: "image/svg+xml", parts: [{ at: 0, bytes: ascii("<svg",), },], },
  { mime: "image/svg+xml", parts: [{ at: 0, bytes: ascii("<?xml",), },], },
  { mime: "image/svg+xml", parts: [{ at: 0, bytes: raw(0xef, 0xbb, 0xbf,), }, { at: 3, bytes: ascii("<svg",), },], },
  { mime: "image/svg+xml", parts: [{ at: 0, bytes: raw(0xef, 0xbb, 0xbf,), }, { at: 3, bytes: ascii("<?xml",), },], },
];

const ZIP_LOCAL = ascii("PK\x03\x04",);
const ORA_NAME = ascii("mimetype",);
const ORA_MIME = ascii("image/openraster",);
const ORA_HEADER_LIMIT = 1024;

function matchesParts(bytes: Uint8Array, parts: readonly MagicPart[],): boolean {
  return parts.every((part,) =>
    bytes.length >= part.at + part.bytes.length &&
    part.bytes.every((byte, index,) => bytes[part.at + index] === byte)
  );
}

/** Bounded header scan — no decompression, no unbounded zip walk. */
function containsWithin(bytes: Uint8Array, needle: Uint8Array, limit: number,): boolean {
  const last = Math.min(bytes.length, limit,) - needle.length;
  for (let index = 0; index <= last; index++) {
    let matched = 0;
    while (matched < needle.length && bytes[index + matched] === needle[matched]) { matched++; }
    if (matched === needle.length) { return true; }
  }
  return false;
}

/**
 * Identify known containers by magic bytes only — extensions and declared
 * MIME types cannot spoof this. SVG is reported so the upload gate blocks it.
 */
export function mimeFromBytes(bytes: Uint8Array,): string | null {
  const row = MAGIC_ROWS.find((candidate,) => matchesParts(bytes, candidate.parts,));
  if (row) { return row.mime; }
  // ORA is a zip: only its bounded header may claim the mimetype entry.
  if (
    matchesParts(bytes, [{ at: 0, bytes: ZIP_LOCAL, },],) &&
    containsWithin(bytes, ORA_NAME, ORA_HEADER_LIMIT,) &&
    containsWithin(bytes, ORA_MIME, ORA_HEADER_LIMIT,)
  ) {
    return "image/openraster";
  }
  return null;
}
