/**
 * Browser-compatible compression and encryption utilities.
 * Uses native browser APIs: Compression Streams API, WebCrypto API.
 */

import { jsonBody, safeJsonParse } from "./alpine/json";
import { type BrowserContentEncoding, browserDecodeContent } from "./browser-compress";
import { browserDecryptContent, browserEncryptContent } from "./browser-crypto";

export type { BrowserContentEncoding, BrowserEncodeResult } from "./browser-compress";
export { browserDecodeContent, browserEncodeContent } from "./browser-compress";
export type { BrowserEncryptResult } from "./browser-crypto";
export {
  browserDecryptContent,
  browserEncryptContent,
  browserExportKey,
  browserGenerateKey,
  browserImportKey,
} from "./browser-crypto";

export interface BrowserEncryptedPayload {
  enc: string;
  nonce: string;
  algo: "aes-256-gcm";
  comp: boolean;
  compAlgo?: string;
  key_id: string;
}

function stringToUint8Array(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function uint8ArrayToBase64(buf: Uint8Array): string {
  let binary = "";
  const len = buf.length;
  for (let i = 0; i < len; i++) {
    binary += String.fromCodePoint(buf[i]);
  }
  return btoa(binary);
}

async function tryGzipCompress(data: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const stream = new CompressionStream("gzip");
    const writer = stream.writable.getWriter();
    await writer.write(data as Uint8Array<ArrayBuffer>);
    await writer.close();
    const response = new Response(stream.readable);
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
}

async function tryBrotliCompress(data: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const stream = new CompressionStream("brotli" as CompressionFormat);
    const writer = stream.writable.getWriter();
    await writer.write(data as Uint8Array<ArrayBuffer>);
    await writer.close();
    const response = new Response(stream.readable);
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Write pipeline: plaintext → compress → encrypt → EncryptedPayload JSON.
 * Matches server-side crypto/pipeline.ts shape.
 */
export async function browserCompressThenEncrypt(
  plaintext: string,
  key: CryptoKey,
  keyId: string,
  threshold = 128,
): Promise<string> {
  let compressed = "";
  let compAlgo: string | undefined;
  let didCompress = false;

  if (plaintext.length >= threshold) {
    const uint8 = stringToUint8Array(plaintext);
    const algos = ["gzip", "brotli", "zstd"] as const;
    for (const algo of algos) {
      let result: Uint8Array | null = null;
      if (algo === "gzip") result = await tryGzipCompress(uint8);
      else if (algo === "brotli") result = await tryBrotliCompress(uint8);
      if (result && result.length < uint8.length) {
        compressed = uint8ArrayToBase64(result);
        compAlgo = algo;
        didCompress = true;
        break;
      }
    }
  }

  const dataToEncrypt = didCompress ? compressed : plaintext;
  const { ciphertext, nonce } = await browserEncryptContent(dataToEncrypt, key);

  const payload: BrowserEncryptedPayload = {
    enc: ciphertext,
    nonce,
    algo: "aes-256-gcm",
    comp: didCompress,
    compAlgo: didCompress ? compAlgo : undefined,
    key_id: keyId,
  };

  return jsonBody(payload);
}

/**
 * Read pipeline: EncryptedPayload JSON → decrypt → decompress → plaintext.
 * Matches server-side crypto/pipeline.ts decryptThenDecompress.
 */
export async function browserDecryptThenDecompress(stored: string, key: CryptoKey): Promise<string> {
  const result = safeJsonParse<BrowserEncryptedPayload>(stored);
  if (!result.ok) throw new Error("Malformed encrypted payload");
  const payload = result.value;
  if (!payload.enc || !payload.nonce || !payload.algo) {
    throw new Error("Malformed encrypted payload");
  }
  const plaintext = await browserDecryptContent(payload.enc, payload.nonce, key);
  if (!payload.comp) return plaintext;
  return browserDecodeContent(plaintext, (payload.compAlgo ?? "gzip") as BrowserContentEncoding);
}
