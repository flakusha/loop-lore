// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/federation/spki-pin.ts — Leaf-SPKI pin verification for federation peers.
//
// node:tls pre-flight: connect with `rejectUnauthorized: false` (chain trust
// stays fetch's job; this layer pins peer identity), capture the leaf
// certificate, hash its SubjectPublicKeyInfo (SHA-256, base64, `sha256:`
// prefix) and compare against the peer's configured `trust.spkiPins`.
//
// TOCTOU: the pin is verified on a separate socket from the fetch that
// follows. A peer rotating its certificate inside that window serves a
// different leaf than the one verified here — pin verification is a hardening
// signal, not a security boundary. Full elimination requires HTTP over our
// own TLS socket; deferred as not worth the complexity today (see
// TASK-spki-pin-verification-for-federation-peers).

import { createHash, X509Certificate, } from "node:crypto";
import * as tls from "node:tls";
import { safeJsonStringify, } from "../utils/safe-json";
import { canonicalOrigin, } from "./peer-fetch";

/** Base64 SPKI pin, bare (`<base64>`) or prefixed (`sha256:<base64>`). */
export type SpkiPin = string;

/** Default pin-verdict cache TTL — mirrors the gossip heartbeat TTL. */
export const PIN_VERDICT_TTL_MS = 30_000;
/** Default pre-flight socket timeout in ms. */
export const PIN_PROBE_TIMEOUT_MS = 5_000;
/** Cap on cached verdicts (bounds memory under config churn). */
const MAX_VERDICTS = 1_024;

/**
 * Derive the `sha256:` SPKI pin of a DER-encoded X.509 certificate.
 * @param der DER certificate bytes.
 * @returns Pin in HPKP form: `sha256:<base64 digest of SubjectPublicKeyInfo>`.
 * @throws {Error} when the bytes do not parse as an X.509 certificate.
 */
export function spkiPinFromDer(der: Buffer,): string {
  const cert = new X509Certificate(der,);
  const spki = cert.publicKey.export({ type: "spki", format: "der", },) as Buffer;
  return `sha256:${createHash("sha256",).update(spki,).digest("base64",)}`;
}

/**
 * Strip an optional `sha256:` prefix and surrounding whitespace. Shared by
 * pin derivation and pin-set parsing so both sides stay in lockstep.
 */
function normalizePin(pin: string,): string {
  const trimmed = pin.trim();
  return trimmed.startsWith("sha256:",) ? trimmed.slice("sha256:".length,) : trimmed;
}

/** SNI must be a DNS name; IP literals are excluded (RFC 6066). */
function sniName(host: string,): string | undefined {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host,) || host.includes(":",) ? undefined : host;
}

/**
 * Whether a derived pin is listed in a pin set. Prefix-tolerant: a bare
 * base64 pin matches its `sha256:`-prefixed form and vice versa.
 */
export function pinsMatch(pin: string, pins: readonly string[],): boolean {
  const candidate = normalizePin(pin,);
  return candidate !== "" && pins.some((p,) => normalizePin(p,) === candidate);
}

/** Probe seam: open a TLS connection and return the leaf's SPKI pin. */
export type SpkiProbe = (opts: {
  host: string;
  port: number;
  /** SNI hostname; defaults to host. */
  servername?: string;
  timeoutMs?: number;
},) => Promise<string>;

/**
 * Connect to a peer, capture the leaf certificate, derive its SPKI pin.
 * Chain validation is intentionally off (`rejectUnauthorized: false`) — the
 * pin comparison is the check performed here; fetch enforces chain trust.
 * @throws {Error} when the connection fails, times out, or no leaf
 *   certificate is presented.
 */
export function probeSpkiPin(opts: {
  host: string;
  port: number;
  servername?: string;
  timeoutMs?: number;
},): Promise<string> {
  return new Promise<string>((resolve, reject,) => {
    const timeoutMs = opts.timeoutMs ?? PIN_PROBE_TIMEOUT_MS;
    const socket = tls.connect({
      host: opts.host,
      port: opts.port,
      servername: opts.servername ?? sniName(opts.host,),
      rejectUnauthorized: false,
    }, () => {
      try {
        const leaf = socket.getPeerCertificate();
        if (leaf === null || !Buffer.isBuffer(leaf.raw,)) {
          throw new Error("peer presented no leaf certificate",);
        }

        resolve(spkiPinFromDer(leaf.raw,),);
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err,),),);
      } finally {
        socket.destroy();
      }
    },);

    socket.setTimeout(timeoutMs > 0 ? timeoutMs : PIN_PROBE_TIMEOUT_MS, () => {
      socket.destroy(new Error(`spki probe timed out after ${timeoutMs}ms`,),);
    },);

    socket.once("error", reject,);
  },);
}

/** Parsed https origin plus its active (normalized) pins; null when unverifiable. */
function parsePinTarget(
  origin: string,
  pins: readonly string[],
): { host: string; port: number; pins: string[] } | null {
  const active = pins.map(normalizePin,).filter((p,) => p !== "");
  if (active.length === 0) { return null; }
  let url: URL;
  try {
    url = new URL(origin,);
  } catch {
    return null;
  }

  // A pinned origin must be https: pinning is meaningless over plaintext, and
  // returning false here prevents a silent downgrade of a pinned peer.
  if (url.protocol !== "https:") { return null; }
  const raw = url.hostname;
  const host = raw.startsWith("[",) && raw.endsWith("]",) ? raw.slice(1, -1,) : raw;
  if (host === "") { return null; }
  const port = url.port === "" ? 443 : Number(url.port,);
  if (!Number.isInteger(port,) || port < 1 || port > 65535) { return null; }
  return { host, port, pins: active, };
}

/**
 * One-shot pin verification of a peer origin. Never throws: probe failures
 * (unreachable, timeout, TLS error) and unverifiable origins (non-https,
 * empty pin set) return `false`.
 * @param origin Peer origin (`https://host[:port]`).
 * @param pins Configured SPKI pins for the peer.
 * @param timeoutMs Pre-flight socket timeout.
 * @returns Whether the live leaf certificate matches any pin.
 */
export async function verifyPeerPin(
  origin: string,
  pins: readonly string[],
  timeoutMs: number = PIN_PROBE_TIMEOUT_MS,
): Promise<boolean> {
  const target = parsePinTarget(origin, pins,);
  if (target === null) { return false; }
  try {
    const pin = await probeSpkiPin({
      host: target.host,
      port: target.port,
      timeoutMs,
    },);

    return pinsMatch(pin, target.pins,);
  } catch {
    return false;
  }
}

/** Async pin verdict for one peer origin. */
export type PeerPinVerifier = (
  origin: string,
  pins: readonly string[],
) => Promise<boolean>;

/**
 * Pin verifier with a per-origin verdict cache: one socket probe per origin
 * and pin-set per TTL. Only positive verdicts are cached, so a mismatching
 * or unreachable peer is re-probed on the next poll and recovers within one
 * poll after a cert rotation instead of after a full TTL.
 */
export function createPeerPinVerifier(opts: {
  /** Verdict TTL in ms; defaults to `PIN_VERDICT_TTL_MS`. */
  ttlMs?: number;
  /** Monotonic clock (injectable for tests). */
  now?: () => number;
  /** Probe seam (injectable for tests). */
  probe?: SpkiProbe;
} = {},): PeerPinVerifier {
  const ttlMs = opts.ttlMs ?? PIN_VERDICT_TTL_MS;
  const now = opts.now ?? Date.now;
  const probe = opts.probe ?? probeSpkiPin;
  const verified = new Map<string, { expiresAt: number }>();

  return async (origin, pins,) => {
    const target = parsePinTarget(origin, pins,);
    if (target === null) { return false; }
    const cacheOrigin = canonicalOrigin(origin,);
    if (cacheOrigin === null) { return false; }
    // Key on origin + pin set so a reconfigured pin set always re-probes;
    // JSON escaping keeps distinct pin sets from colliding on a join char.
    const encoded = safeJsonStringify([...target.pins,].sort(),);
    const key = `${cacheOrigin}|${encoded.ok ? encoded.value : "[]"}`;
    const hit = verified.get(key,);
    if (hit !== undefined && now() < hit.expiresAt) { return true; }
    try {
      const pin = await probe({
        host: target.host,
        port: target.port,
      },);

      if (!pinsMatch(pin, target.pins,)) { return false; }
    } catch {
      return false;
    }

    if (verified.size >= MAX_VERDICTS) {
      const oldest = verified.keys().next();
      if (oldest.done !== true) { verified.delete(oldest.value,); }
    }

    verified.set(key, { expiresAt: now() + ttlMs, },);
    return true;
  };
}
