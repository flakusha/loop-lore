// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/federation/peer-fetch.ts — Peer advertisement fetch seam.
//
// Default implementation fetches over safeFetch with per-peer TLS trust
// (custom CA bundles) and a bounded timeout. SPKI pins / mTLS are NOT
// enforced — runtimes expose no peer-certificate handle for pin comparison;
// custom-CA trust is the enforceable subset today. Injectable for tests.

import type { FederationPeerTrustConfig, } from "../config/schema";
import { safeFetch, } from "../utils/safe-fetch";

/** Per-poll fetch timeout for peer advertisements. */
export const PEER_FETCH_TIMEOUT_MS = 5_000;

/** Minimal shape of a peer `/api/instance-state` advertisement. */
export interface InstanceAdvertisement {
  /** Mesh origins known to the advertising peer. */
  peers?: unknown;
  /** Receiver-side inbound capacity in bytes, when the peer reports it. */
  capacityBytes?: unknown;
}

/** Fetch implementation seam (injectable for tests). */
export type PeerFetch = (
  url: string,
  trust: FederationPeerTrustConfig | undefined,
) => Promise<{ ok: boolean; status: number; body: unknown }>;

/**
 * Fetch a peer advertisement with an optional per-peer CA bundle.
 * Never throws — misses surface as `{ ok: false, status: 0 }`.
 * @param url
 * @param trust
 * @param timeoutMs
 * @returns Status + parsed JSON body (null when unparseable).
 */
export async function fetchPeerAdvertisement(
  url: string,
  trust: FederationPeerTrustConfig | undefined,
  timeoutMs: number = PEER_FETCH_TIMEOUT_MS,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const result = await safeFetch<unknown>(url, {
    timeout: timeoutMs,
    parseJson: true,
    handle401: false,
    tls: trust?.caBundle ? { ca: [trust.caBundle,], } : undefined,
  },);
  if (!result.ok) {
    return { ok: false, status: result.status ?? 0, body: null, };
  }
  return { ok: true, status: result.status, body: result.data, };
}

/**
 * Canonicalize a peer origin to `URL.origin` (lowercased host, no path).
 * @param raw
 * @returns Canonical origin, or null when not an http(s) URL.
 */
export function canonicalOrigin(raw: unknown,): string | null {
  if (typeof raw !== "string") { return null; }
  let url: URL;
  try {
    url = new URL(raw,);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") { return null; }
  if (url.username !== "" || url.password !== "") { return null; }
  if (url.hostname === "") { return null; }
  return url.origin;
}

/** POST implementation seam (injectable for tests). */
export type PeerPost = (
  url: string,
  body: unknown,
) => Promise<{ ok: boolean; status: number; body: unknown }>;

/**
 * POST JSON to a peer with an optional per-peer CA bundle.
 * Never throws — misses surface as `{ ok: false, status: 0 }`.
 * @param url
 * @param body
 * @param trust
 * @param timeoutMs
 * @returns Status + parsed JSON body (null when unparseable).
 */
export async function postPeerJson(
  url: string,
  body: unknown,
  trust: FederationPeerTrustConfig | undefined,
  timeoutMs: number = PEER_FETCH_TIMEOUT_MS,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  let result;
  try {
    result = await safeFetch<unknown>(url, {
      method: "POST",
      body,
      timeout: timeoutMs,
      parseJson: true,
      handle401: false,
      tls: trust?.caBundle ? { ca: [trust.caBundle,], } : undefined,
    },);
  } catch {
    return { ok: false, status: 0, body: null, };
  }
  if (!result.ok) {
    return { ok: false, status: result.status ?? 0, body: null, };
  }
  return { ok: true, status: result.status, body: result.data, };
}
