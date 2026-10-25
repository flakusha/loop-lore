// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/federation/mesh-proof.ts — HMAC proof-of-possession for the mesh
// reserve endpoint. The mesh PSK used to be read only as an on/off flag on
// `/api/mesh-reserve`, so anyone reachable could name a trusted origin and
// receive that peer's inbound content key. Senders now sign the canonical
// reservation material with the shared PSK (HMAC-SHA256) and receivers
// verify it (timing-safe) before trusting the request at all.
import { createHmac, timingSafeEqual, } from "node:crypto";
import { safeJsonStringify, } from "../utils";

/** Reservation fields both sides sign (the reserve request body). */
export interface MeshReserveMaterial {
  senderOrigin: string;
  contentHash: string;
  sizeBytes: number;
  contentType?: string;
  ttlMs?: number;
}

/**
 * Canonical string of the reservation material: fixed key order with
 * optional fields normalized to null, so sender and receiver serialize
 * identically regardless of what the HTTP layer preserved.
 * @param material Reservation fields.
 * @returns Deterministic JSON string to sign.
 */
function canonical(material: MeshReserveMaterial,): string {
  const result = safeJsonStringify({
    senderOrigin: material.senderOrigin,
    contentHash: material.contentHash,
    sizeBytes: material.sizeBytes,
    contentType: material.contentType ?? null,
    ttlMs: material.ttlMs ?? null,
  },);

  // Plain string/number/null data cannot fail serialization.
  return result.ok ? result.value : "";
}

/**
 * Compute the mesh reserve proof: hex HMAC-SHA256 of the canonical
 * reservation material keyed by the mesh PSK.
 * @param secret Shared mesh PSK (config.federation.meshPsk).
 * @param material Reservation fields exactly as they will be sent.
 * @returns {Promise} Hex digest to attach as the body `proof` field.
 */
export async function meshReserveProof(
  secret: string,
  material: MeshReserveMaterial,
): Promise<string> {
  return createHmac("sha256", secret,).update(canonical(material,),).digest("hex",);
}

/**
 * Verify a mesh reserve proof in constant time.
 * @param secret Shared mesh PSK (config.federation.meshPsk).
 * @param material Reservation fields as received.
 * @param proof Claimed hex digest from the request body.
 * @returns {Promise} True when the proof matches.
 */
export async function verifyMeshReserveProof(
  secret: string,
  material: MeshReserveMaterial,
  proof: unknown,
): Promise<boolean> {
  if (typeof proof !== "string") { return false; }
  const expected = Buffer.from(await meshReserveProof(secret, material,), "hex",);
  const claimed = Buffer.from(proof, "hex",);
  return expected.length === claimed.length && timingSafeEqual(expected, claimed,);
}
