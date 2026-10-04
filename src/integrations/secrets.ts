// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/integrations/secrets.ts — encrypted adapter-credential envelope.
//
// Every adapter credential (SMTP/IMAP password, Matrix access token, XMPP
// password, Telegram/Discord bot token, Nostr private key, ActivityPub
// actor key) is stored at rest as an opaque `secret:v1:` reference sealed
// with the same SMK-wrap AES-GCM envelope the federation peer keys use
// (src/crypto/actor-key-bytes.ts). Config sections keep only the
// reference; `resolveCredential` opens it for the calling consumer. This
// module performs no logging of any kind — plaintext exists only in the
// return value handed to the caller.
//
// Rotation limitation: the repo key hierarchy has a single unversioned
// SMK (src/crypto/smk.ts) — there is no versioned-key store for
// SMK-wrapped envelopes. `rewrapCredential` therefore re-seals under
// caller-supplied new key material (`to`); envelopes carry a `v1` format
// tag so a future versioned scheme can slot in without a prefix change.

import { decryptBytes, encryptBytes, } from "../crypto/actor-key-bytes";
import { getSmk, } from "../crypto/smk";
import { mustFromString, mustFromUint8Array, } from "../utils/safe-buffer";

/** Prefix marking a credential reference (vs a raw configured value). */
export const SECRET_REF_PREFIX = "secret:";

/** Fixed marker replacing every redacted credential value. */
export const REDACTED_MARKER = "[REDACTED]";

/** Envelope format version embedded after the prefix. */
const ENVELOPE_VERSION = "v1";

/** Credential-bearing config keys, matched case-insensitively. */
const SENSITIVE_KEYS: Record<string, true> = {
  accesstoken: true,
  bottoken: true,
  imappass: true,
  password: true,
  privatekey: true,
  secret: true,
  smtppass: true,
  token: true,
};

/** Machine-readable failure kinds for the credential envelope. */
export type SecretEnvelopeCode = "unavailable" | "malformed" | "tampered";

/** Typed error for seal/open/rewrap failures. Never carries plaintext. */
export class SecretEnvelopeError extends Error {
  readonly code: SecretEnvelopeCode;

  constructor(code: SecretEnvelopeCode, message: string,) {
    super(message,);
    this.name = "SecretEnvelopeError";
    this.code = code;
  }
}

/** Key material for the credential envelope; default resolves the SMK. */
export interface CredentialKeySource {
  readonly smk?: () => CryptoKey | null;
}

/** Rewrap keys: what the ref opens under, what it is re-sealed under. */
export interface RewrapCredentialOpts {
  readonly from?: () => CryptoKey | null;
  readonly to?: () => CryptoKey | null;
}

/**
 * Resolve envelope key material: injected getter first, repo SMK second.
 * @param source
 * @param kind
 * @returns void
 * @throws {SecretEnvelopeError} When no key material is available.
 */
function requireKey(source: CredentialKeySource | undefined, kind: string,): CryptoKey {
  const key = source?.smk?.() ?? getSmk();
  if (!key) {
    throw new SecretEnvelopeError(
      "unavailable",
      `credential envelope ${kind} requires key material — set SERVER_ENCRYPTION_KEY or inject smk`,
    );
  }

  return key;
}

/**
 * Encrypt an adapter credential at rest under the SMK-wrap envelope.
 * @param plain Plaintext credential (password, token, private key).
 * @param opts
 * @returns Opaque `secret:v1:` reference safe to store in config.
 * @throws {SecretEnvelopeError} When key material is unavailable or `plain` is already a reference.
 */
export async function sealCredential(plain: string, opts?: CredentialKeySource,): Promise<string> {
  if (plain.startsWith(SECRET_REF_PREFIX,)) {
    throw new SecretEnvelopeError("malformed", "refusing to seal an existing credential reference — store it as-is",);
  }

  const key = requireKey(opts, "seal",);
  const envelope = await encryptBytes(key, mustFromString(plain,),);
  return `${SECRET_REF_PREFIX}${ENVELOPE_VERSION}:${envelope}`;
}

/**
 * Structurally validate a `secret:v1:` reference into envelope chunks.
 * @param ref
 * @returns iv/ciphertext base64 pair
 * @throws {SecretEnvelopeError} When the reference is not a well-formed v1 envelope.
 */
function parseRef(ref: string,): { iv: string; ct: string } {
  const head = `${SECRET_REF_PREFIX}${ENVELOPE_VERSION}:`;
  if (!ref.startsWith(head,)) {
    throw new SecretEnvelopeError("malformed", `not a ${head}<iv>:<ciphertext> credential reference`,);
  }

  const parts = ref.slice(head.length,).split(":",);
  if (parts.length !== 2 || parts[0] === "" || parts[1] === "") {
    throw new SecretEnvelopeError("malformed", `credential reference must be ${head}<iv>:<ciphertext>`,);
  }

  for (const part of parts) {
    try {
      Uint8Array.fromBase64(part,);
    } catch {
      throw new SecretEnvelopeError("malformed", "credential reference chunks must be base64",);
    }
  }

  return { iv: parts[0]!, ct: parts[1]!, };
}

/**
 * Open a `secret:v1:` reference back to the plaintext credential.
 * @param ref
 * @param opts
 * @returns Plaintext credential — handed to the caller only, never logged.
 * @throws {SecretEnvelopeError} On unavailable keys, malformed refs, tampering, or wrong key material.
 */
export async function openCredential(ref: string, opts?: CredentialKeySource,): Promise<string> {
  const key = requireKey(opts, "open",);
  const { iv, ct, } = parseRef(ref,);
  try {
    return mustFromUint8Array(await decryptBytes(key, `${iv}:${ct}`,),).toString("utf8",);
  } catch {
    // GCM auth failure: tampered payload or envelope sealed under other key
    // material — indistinguishable by design, and neither carries plaintext.
    throw new SecretEnvelopeError(
      "tampered",
      "credential envelope failed authentication — tampered or sealed under different key material",
    );
  }
}

/**
 * Resolve a configured credential value: raw values pass through,
 * `secret:` references are opened. The webhook HMAC verifier and every
 * adapter consumer call this, never the raw config field.
 * @param value Raw configured value or `secret:` reference.
 * @param opts
 * @returns Plaintext credential, only to the caller.
 * @throws {SecretEnvelopeError} When the reference cannot be opened.
 */
export async function resolveCredential(
  value: string,
  opts?: CredentialKeySource,
): Promise<string> {
  return value.startsWith(SECRET_REF_PREFIX,) ? openCredential(value, opts,) : value;
}

/**
 * Re-seal a credential reference: open under `from` (default: repo SMK),
 * seal under `to` (default: `from`). Pure — callers swap the stored
 * reference atomically, so there is no downtime window.
 * @param ref Existing `secret:v1:` reference.
 * @param opts
 * @returns New `secret:v1:` reference.
 * @throws {SecretEnvelopeError} When opening fails or target key material is unavailable.
 */
export async function rewrapCredential(ref: string, opts?: RewrapCredentialOpts,): Promise<string> {
  const from = opts?.from ?? getSmk;
  const plain = await openCredential(ref, { smk: from, },);
  return await sealCredential(plain, { smk: opts?.to ?? from, },);
}

/**
 * Deep-walk a config/log record and replace every credential — any
 * `secret:`-prefixed string plus values under known sensitive keys — with
 * the fixed marker. Pure: returns a redacted clone, input stays intact.
 * @param record Config/log record about to be persisted or logged.
 * @returns Redacted structural clone safe for audit logs.
 */
export function redactCredentials<T,>(record: T,): T {
  return redactValue(record, false,) as T;
}

/**
 * Redact one value; `sensitive` sticks to all descendants once set.
 * @param value
 * @param sensitive
 * @returns void
 */
function redactValue(value: unknown, sensitive: boolean,): unknown {
  if (typeof value === "string") {
    return sensitive || value.startsWith(SECRET_REF_PREFIX,) ? REDACTED_MARKER : value;
  }

  if (Array.isArray(value,)) {
    return value.map((item,) => redactValue(item, sensitive,));
  }

  if (typeof value === "object" && value !== null && isPlainRecord(value,)) {
    const out: Record<string, unknown> = {};
    for (const [key, val,] of Object.entries(value,)) {
      out[key] = redactValue(val, sensitive || SENSITIVE_KEYS[key.toLowerCase()] === true,);
    }

    return out;
  }

  return value;
}

/**
 * Plain key-value records only — Dates and other class instances pass
 * through redaction untouched instead of being flattened to `{}`.
 * @param value
 * @returns void
 */
function isPlainRecord(value: object,): value is Record<string, unknown> {
  const proto = Object.getPrototypeOf(value,);
  return proto === Object.prototype || proto === null;
}
