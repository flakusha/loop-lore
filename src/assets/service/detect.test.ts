// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for assets/service/detect.ts — MIME → asset type and
 * filename extension → MIME detection.
 */

import { describe, expect, test, } from "bun:test";
import { AssetType, } from "../../db/enums";
import { detectAssetType, mimeFromExtension, } from "./detect";

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
