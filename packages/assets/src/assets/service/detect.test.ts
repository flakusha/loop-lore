// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for assets/service/detect.ts — MIME → asset type and
 * filename extension → MIME detection.
 */

import { describe, expect, test, } from "bun:test";
import { AssetType, } from "../../../../../src/db/enums";
import { detectAssetType, extensionForMime, mimeFromBytes, mimeFromExtension, } from "./detect";

describe("detectAssetType", () => {
  test("maps image/* to Image", () => {
    expect(detectAssetType("image/png",),).toBe(AssetType.Image,);
    expect(detectAssetType("image/jpeg",),).toBe(AssetType.Image,);
    expect(detectAssetType("image/webp",),).toBe(AssetType.Image,);
  });

  test("maps audio/* to Audio", () => {
    expect(detectAssetType("audio/ogg",),).toBe(AssetType.Audio,);
    expect(detectAssetType("audio/mpeg",),).toBe(AssetType.Audio,);
  });

  test("maps video/* to Video", () => {
    expect(detectAssetType("video/mp4",),).toBe(AssetType.Video,);
    expect(detectAssetType("video/webm",),).toBe(AssetType.Video,);
  });

  test("maps everything else to Other", () => {
    expect(detectAssetType("application/pdf",),).toBe(AssetType.Other,);
    expect(detectAssetType("text/plain",),).toBe(AssetType.Other,);
    expect(detectAssetType("",),).toBe(AssetType.Other,);
  });

  test("prefix match only — similar-but-different prefixes stay Other", () => {
    expect(detectAssetType("imaginary/png",),).toBe(AssetType.Other,);
    expect(detectAssetType("audiofile/mp3",),).toBe(AssetType.Other,);
  });

  test("maps model/* to Model", () => {
    expect(detectAssetType("model/gltf-binary",),).toBe(AssetType.Model,);
    expect(detectAssetType("model/gltf+json",),).toBe(AssetType.Model,);
  });
});

describe("mimeFromExtension", () => {
  test("maps image extensions", () => {
    expect(mimeFromExtension("a.jpg",),).toBe("image/jpeg",);
    expect(mimeFromExtension("a.jpeg",),).toBe("image/jpeg",);
    expect(mimeFromExtension("a.png",),).toBe("image/png",);
    expect(mimeFromExtension("a.webp",),).toBe("image/webp",);
    expect(mimeFromExtension("a.avif",),).toBe("image/avif",);
    expect(mimeFromExtension("a.gif",),).toBe("image/gif",);
    expect(mimeFromExtension("a.svg",),).toBe("image/svg+xml",);
  });

  test("maps audio extensions", () => {
    expect(mimeFromExtension("a.ogg",),).toBe("audio/ogg",);
    expect(mimeFromExtension("a.opus",),).toBe("audio/opus",);
    expect(mimeFromExtension("a.mp3",),).toBe("audio/mpeg",);
    expect(mimeFromExtension("a.flac",),).toBe("audio/flac",);
    expect(mimeFromExtension("a.wav",),).toBe("audio/wav",);
  });

  test("maps video extensions", () => {
    expect(mimeFromExtension("a.webm",),).toBe("video/webm",);
    expect(mimeFromExtension("a.mp4",),).toBe("video/mp4",);
    expect(mimeFromExtension("a.mkv",),).toBe("video/x-matroska",);
  });

  test("maps document extensions", () => {
    expect(mimeFromExtension("a.pdf",),).toBe("application/pdf",);
    expect(mimeFromExtension("a.json",),).toBe("application/json",);
    expect(mimeFromExtension("a.txt",),).toBe("text/plain",);
  });

  test("maps model extensions", () => {
    expect(mimeFromExtension("a.glb",),).toBe("model/gltf-binary",);
    expect(mimeFromExtension("a.gltf",),).toBe("model/gltf+json",);
    expect(mimeFromExtension("MODEL.GLB",),).toBe("model/gltf-binary",);
  });

  test("maps honkbox-compatible image and model extensions", () => {
    const cases: ReadonlyArray<[string, string,]> = [
      ["a.exr", "image/x-exr",],
      ["a.ora", "image/openraster",],
      ["a.ply", "model/ply",],
      ["a.splat", "model/splat",],
      ["a.spz", "model/spz",],
      ["a.obj", "model/obj",],
      ["a.fbx", "model/fbx",],
      ["a.usda", "model/usd",],
      ["a.usdc", "model/usd",],
      ["a.usdz", "model/usd",],
      ["a.usd", "model/usd",],
      ["a.stl", "model/stl",],
      ["a.3mf", "model/3mf",],
    ];
    for (const [name, mime,] of cases) {
      expect(mimeFromExtension(name,),).toBe(mime,);
    }
  });

  test("is case-insensitive", () => {
    expect(mimeFromExtension("photo.PNG",),).toBe("image/png",);
    expect(mimeFromExtension("CLIP.WEBM",),).toBe("video/webm",);
  });

  test("uses the last extension when several dots are present", () => {
    expect(mimeFromExtension("archive.tar.png",),).toBe("image/png",);
    expect(mimeFromExtension("my.file.name.mp3",),).toBe("audio/mpeg",);
  });

  test("falls back to octet-stream for unknown extensions", () => {
    expect(mimeFromExtension("a.xyz",),).toBe("application/octet-stream",);
  });

  test("falls back to octet-stream when the filename has no dot", () => {
    expect(mimeFromExtension("noextension",),).toBe("application/octet-stream",);
  });

  test("falls back to octet-stream for an empty filename", () => {
    expect(mimeFromExtension("",),).toBe("application/octet-stream",);
  });
});

describe("extensionForMime", () => {
  test("maps known MIME types to extensions", () => {
    expect(extensionForMime("image/jpeg",),).toBe("jpeg",);
    expect(extensionForMime("image/png",),).toBe("png",);
    expect(extensionForMime("image/webp",),).toBe("webp",);
    expect(extensionForMime("image/avif",),).toBe("avif",);
    expect(extensionForMime("image/gif",),).toBe("gif",);
    expect(extensionForMime("image/svg+xml",),).toBe("svg",);
    expect(extensionForMime("audio/ogg",),).toBe("ogg",);
    expect(extensionForMime("audio/opus",),).toBe("opus",);
    expect(extensionForMime("audio/mpeg",),).toBe("mp3",);
    expect(extensionForMime("audio/flac",),).toBe("flac",);
    expect(extensionForMime("audio/wav",),).toBe("wav",);
    expect(extensionForMime("video/webm",),).toBe("webm",);
    expect(extensionForMime("video/mp4",),).toBe("mp4",);
    expect(extensionForMime("video/x-matroska",),).toBe("mkv",);
    expect(extensionForMime("application/pdf",),).toBe("pdf",);
    expect(extensionForMime("application/json",),).toBe("json",);
    expect(extensionForMime("text/plain",),).toBe("txt",);
    expect(extensionForMime("model/gltf-binary",),).toBe("glb",);
    expect(extensionForMime("model/gltf+json",),).toBe("gltf",);
  });

  test("maps honkbox-compatible MIMEs to canonical extensions", () => {
    const cases: ReadonlyArray<[string, string,]> = [
      ["image/x-exr", "exr",],
      ["image/openraster", "ora",],
      ["model/ply", "ply",],
      ["model/splat", "splat",],
      ["model/spz", "spz",],
      ["model/obj", "obj",],
      ["model/fbx", "fbx",],
      ["model/usd", "usd",],
      ["model/stl", "stl",],
      ["model/3mf", "3mf",],
    ];
    for (const [mime, ext,] of cases) {
      expect(extensionForMime(mime,),).toBe(ext,);
    }
  });

  test("falls back to bin for unknown MIME types", () => {
    expect(extensionForMime("application/octet-stream",),).toBe("bin",);
    expect(extensionForMime("image/tiff",),).toBe("bin",);
    expect(extensionForMime("",),).toBe("bin",);
  });
});

describe("mimeFromBytes", () => {
  const ascii = (text: string,) => new TextEncoder().encode(text,);
  const concat = (...parts: Uint8Array[]) => new Uint8Array(parts.flatMap((part,) => [...part,]),);
  const ora = concat(ascii("PK\x03\x04",), ascii("mimetype",), ascii("image/openraster",),);
  const cases: ReadonlyArray<[Uint8Array, string,]> = [
    [ascii("glTF",), "model/gltf-binary",],
    [concat(ascii("v/1",), new Uint8Array([0x01,],),), "image/x-exr",],
    [ascii("ply\n",), "model/ply",],
    [ascii("NGSP",), "model/spz",],
    [ascii("Kaydara FBX Binary  \x00\x1a\x00",), "model/fbx",],
    [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,],), "image/png",],
    [new Uint8Array([0xff, 0xd8, 0xff,],), "image/jpeg",],
    [ascii("GIF89a",), "image/gif",],
    [concat(ascii("RIFF",), new Uint8Array(4,), ascii("WEBP",),), "image/webp",],
    [ascii("<svg",), "image/svg+xml",],
    [ascii("<?xml",), "image/svg+xml",],
    [concat(new Uint8Array([0xef, 0xbb, 0xbf,],), ascii("<svg",),), "image/svg+xml",],
    [ora, "image/openraster",],
  ];

  test("identifies containers by magic bytes, never by name or declaration", () => {
    for (const [bytes, mime,] of cases) {
      expect(mimeFromBytes(bytes,),).toBe(mime,);
    }
  });

  test("returns null for unknown, truncated and plain zip bytes", () => {
    expect(mimeFromBytes(ascii("{}",),),).toBeNull();
    expect(mimeFromBytes(ascii("gl",),),).toBeNull();
    expect(mimeFromBytes(ascii("PK\x03\x04some.zip",),),).toBeNull();
    expect(mimeFromBytes(new Uint8Array(0,),),).toBeNull();
  });
});
