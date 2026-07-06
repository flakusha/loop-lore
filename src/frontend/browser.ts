/**
 * Browser-compatible compression and encryption utilities.
 * Uses native browser APIs: Compression Streams API, WebCrypto API.
 *
 * Typechecked with tsconfig.frontend.json (includes DOM lib, no Bun types).
 */

export type BrowserContentEncoding = "identity" | "gzip" | "brotli" | "zstd";

export interface BrowserEncodeResult {
  encoded: string;
  encoding: BrowserContentEncoding;
}

export interface BrowserEncryptResult {
  ciphertext: string;
  nonce: string;
  algorithm: "aes-256-gcm";
}

const COMPRESS_THRESHOLD = 128;

function stringToUint8Array(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function uint8ArrayToString(buf: Uint8Array): string {
  return new TextDecoder().decode(buf);
}

function uint8ArrayToBase64(buf: Uint8Array): string {
  let binary = "";
  const len = buf.length;
  for (let i = 0; i < len; i++) {
    binary += String.fromCodePoint(buf[i]!);
  }
  return btoa(binary);
}

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.codePointAt(i)!;
  }
  return bytes;
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

async function tryGzipDecompress(data: Uint8Array): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === "undefined") return null;
  try {
    const stream = new DecompressionStream("gzip");
    const blob = new Blob([data as Uint8Array<ArrayBuffer>]);
    const input = blob.stream().pipeThrough(stream);
    const response = new Response(input);
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
}

function tryZstdCompress(_data: Uint8Array): Promise<Uint8Array | null> {
  return Promise.resolve(null);
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

async function tryBrotliDecompress(data: Uint8Array): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === "undefined") return null;
  try {
    const stream = new DecompressionStream("brotli" as CompressionFormat);
    const blob = new Blob([data as Uint8Array<ArrayBuffer>]);
    const input = blob.stream().pipeThrough(stream);
    const response = new Response(input);
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
}

function tryZstdDecompress(_data: Uint8Array): Promise<Uint8Array | null> {
  return Promise.resolve(null);
}

function getEncoderPriority(encoding: BrowserContentEncoding): ("zstd" | "brotli" | "gzip")[] {
  if (encoding === "zstd") return ["zstd", "gzip"];
  if (encoding === "brotli") return ["brotli", "gzip"];
  return ["gzip"];
}

function getDecoderPriority(encoding: BrowserContentEncoding): ("zstd" | "brotli" | "gzip")[] {
  if (encoding === "zstd" || encoding === "brotli") return [encoding];
  return ["gzip", "brotli", "zstd"];
}

export async function browserEncodeContent(
  plaintext: string,
  encoding: BrowserContentEncoding = "gzip",
): Promise<BrowserEncodeResult> {
  if (encoding === "identity" || !plaintext) {
    return { encoded: plaintext, encoding: "identity" };
  }

  const uint8 = stringToUint8Array(plaintext);

  if (uint8.length < COMPRESS_THRESHOLD) {
    return { encoded: plaintext, encoding: "identity" };
  }

  for (const algo of getEncoderPriority(encoding)) {
    let result: Uint8Array | null;
    if (algo === "zstd") {
      result = await tryZstdCompress(uint8);
    } else if (algo === "brotli") {
      result = await tryBrotliCompress(uint8);
    } else {
      result = await tryGzipCompress(uint8);
    }

    if (result && result.length < uint8.length) {
      return { encoded: uint8ArrayToBase64(result), encoding: algo };
    }
  }

  return { encoded: plaintext, encoding: "identity" };
}

export async function browserDecodeContent(
  stored: string,
  encoding: BrowserContentEncoding,
): Promise<string> {
  if (encoding === "identity" || !stored) return stored;

  const uint8 = base64ToUint8Array(stored);

  for (const algo of getDecoderPriority(encoding)) {
    let result: Uint8Array | null;
    if (algo === "zstd") {
      result = await tryZstdDecompress(uint8);
    } else if (algo === "brotli") {
      result = await tryBrotliDecompress(uint8);
    } else {
      result = await tryGzipDecompress(uint8);
    }

    if (result) return uint8ArrayToString(result);
  }

  return stored;
}

export async function browserEncryptContent(
  plaintext: string,
  key: CryptoKey,
): Promise<BrowserEncryptResult> {
  if (!plaintext) throw new Error("Cannot encrypt empty content");

  const data = stringToUint8Array(plaintext);
  const nonce = crypto.getRandomValues(new Uint8Array(12));

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    data as Uint8Array<ArrayBuffer>,
  );

  return {
    ciphertext: uint8ArrayToBase64(new Uint8Array(encrypted)),
    nonce: uint8ArrayToBase64(nonce),
    algorithm: "aes-256-gcm",
  };
}

export async function browserDecryptContent(
  ciphertext: string,
  nonce: string,
  key: CryptoKey,
): Promise<string> {
  if (!ciphertext || !nonce) throw new Error("Missing ciphertext or nonce");

  const encryptedData = base64ToUint8Array(ciphertext);
  const nonceData = base64ToUint8Array(nonce);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonceData as Uint8Array<ArrayBuffer> },
    key,
    encryptedData as Uint8Array<ArrayBuffer>,
  );

  return uint8ArrayToString(new Uint8Array(decrypted));
}

export async function browserImportKey(base64Key: string): Promise<CryptoKey> {
  const keyData = base64ToUint8Array(base64Key);
  return crypto.subtle.importKey(
    "raw",
    keyData as Uint8Array<ArrayBuffer>,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function browserExportKey(key: CryptoKey): Promise<string> {
  const buffer = await crypto.subtle.exportKey("raw", key);
  return uint8ArrayToBase64(new Uint8Array(buffer));
}

export function browserGenerateKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
