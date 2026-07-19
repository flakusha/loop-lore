// src/characters/charx.ts
//
// CHARX (Character eXchange) format support.
// ZIP archive containing card.json + assets/ directory.

import JSZip from "jszip";
import { jsonParseOr, } from "../utils/safe-json";
import type { CharacterAsset, } from "./parser";

interface CharxResult {
  card: Record<string, unknown>;
  assets: CharacterAsset[];
}

/**
 * Extract character card and assets from CHARX buffer.
 */
export async function extractCharx(buffer: Buffer,): Promise<CharxResult> {
  const zip = await JSZip.loadAsync(buffer,);

  // Find card.json
  const cardFile = zip.file("card.json",);
  if (!cardFile) {
    throw new Error("CHARX archive missing card.json",);
  }

  const cardText = await cardFile.async("text",);
  const card = jsonParseOr(cardText, null,);
  if (!card || typeof card !== "object") {
    throw new Error("Invalid card.json in CHARX archive",);
  }

  // Extract assets
  const assets: CharacterAsset[] = [];
  const assetFolder = zip.folder("assets",);

  if (assetFolder) {
    const assetFiles: { name: string; async(type: "nodebuffer",): Promise<Buffer> }[] = [];
    assetFolder.forEach((_path, file,) => {
      if (!file.dir) {
        assetFiles.push(file,);
      }
    },);

    for (const file of assetFiles) {
      const path = file.name;
      const parts = path.split("/",);
      if (parts.length < 3) { continue; }

      const type = parts[1] ?? "unknown";
      const filename = parts[parts.length - 1] ?? "";
      const ext = filename.split(".",).pop() ?? "";
      const name = filename.replace(`.${ext}`, "",);

      const data = await file.async("nodebuffer",);

      assets.push({
        type,
        name,
        uri: `embeded://${path}`,
        ext,
        data,
      },);
    }
  }

  return { card, assets, };
}

/**
 * Create CHARX buffer from character card and assets.
 */
export async function createCharx(
  card: Record<string, unknown>,
  assets: { path: string; data: Buffer }[],
): Promise<Buffer> {
  const zip = new JSZip();

  // Add card.json
  zip.file("card.json", JSON.stringify(card, null, 2,),);

  // Add assets
  for (const asset of assets) {
    zip.file(`assets/${asset.path}`, asset.data,);
  }

  return zip.generateAsync({ type: "nodebuffer", },);
}

/**
 * Convert embeded:// URI to asset path.
 */
export function resolveEmbededUri(uri: string,): string | null {
  if (!uri.startsWith("embeded://",)) { return null; }
  return uri.slice("embeded://".length,);
}
