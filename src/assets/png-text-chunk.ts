// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** PNG tEXt/zTXt chunk decoding (extracted from ./metadata.ts). */

/** 'zTXt' chunk type in big-endian. */
export const ZTXTSIG = 0x7A_54_58_74;

/**
 * Decode a PNG tEXt/zTXt chunk into its key/value pair (null on empty value).
 * @param buf
 * @param chunkType
 * @param dataStart
 * @param dataEnd
 * @returns void
 */
export function decodeTextChunk(
  buf: Uint8Array,
  chunkType: number,
  dataStart: number,
  dataEnd: number,
): { key: string; value: string } | null {
  // Find null separator between key and value
  let nullPos = dataStart;
  while (nullPos < dataEnd && buf[nullPos] !== 0) { nullPos++; }
  const key = new TextDecoder().decode(buf.slice(dataStart, nullPos,),);
  const valStart = nullPos + 1;
  if (valStart >= dataEnd) { return null; }
  const value = chunkType === ZTXTSIG && buf[valStart] === 0
    ? new TextDecoder().decode(buf.slice(valStart + 1, dataEnd,),)
    : new TextDecoder().decode(buf.slice(valStart, dataEnd,),);
  return { key, value, };
}
