export interface BrowserEncryptResult {
  ciphertext: string;
  nonce: string;
  algorithm: "aes-256-gcm";
}

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
