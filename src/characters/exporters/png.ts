import { getMinimalPng, insertCharacterDataIntoPng, } from "../steganography";

/**
 * Export canonical character card to PNG with embedded data.
 * Embeds both V2 and V3 character data in PNG tEXt chunks.
 */
export function exportToPng(character: any,): Buffer {
  // Get minimal PNG as base image
  const pngBase = getMinimalPng();

  // Insert character data into PNG (both V2 and V3 chunks)
  return insertCharacterDataIntoPng(pngBase, character.data,);
}

/**
 * Export canonical character card to PNG base64 string.
 */
export function exportToPngBase64(character: any,): string {
  const pngBuffer = exportToPng(character,);
  return pngBuffer.toString("base64",);
}
