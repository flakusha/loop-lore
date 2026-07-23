import type { ContentEncoding, EncodeResult, } from "./types";
import { safeCompress, safeFromString, safeToBase64, } from "../utils";

export function encodeContent(plaintext: string, encoding: ContentEncoding,): EncodeResult {
  if (encoding === "identity" || !plaintext) {
    return { encoded: plaintext, encoding: "identity", };
  }

  const bufferResult = safeFromString(plaintext, "utf8",);
  if (!bufferResult.ok) {
    throw bufferResult.error;
  }

  const compressedResult = safeCompress(bufferResult.buffer, encoding,);
  if (!compressedResult.ok) {
    throw compressedResult.error;
  }

  const base64Result = safeToBase64(compressedResult.buffer,);
  if (!base64Result.ok) {
    throw base64Result.error;
  }

  return { encoded: base64Result.buffer, encoding, };
}
