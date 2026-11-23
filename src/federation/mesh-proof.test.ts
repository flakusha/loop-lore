// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/federation/mesh-proof.test.ts — the mesh reserve proof must verify only
// the exact material the sender signed: a tampered reservation, a foreign
// PSK, or a malformed proof must never pass.
import { describe, expect, test, } from "bun:test";
import {
  meshHmacHex,
  type MeshReserveMaterial,
  meshReserveProof,
  verifyMeshHmacHex,
  verifyMeshReserveProof,
} from "./mesh-proof";

const MATERIAL: MeshReserveMaterial = {
  senderOrigin: "https://peer.example",
  contentHash: "content-hash-1",
  sizeBytes: 1024,
};

describe("shared mesh HMAC helpers", () => {
  test("hex proofs verify only the exact signed string", async () => {
    const proof = await meshHmacHex("psk-secret", "material",);
    expect(proof,).toMatch(/^[0-9a-f]{64}$/,);
    expect(await verifyMeshHmacHex("psk-secret", "material", proof,),).toBe(true,);
    expect(await verifyMeshHmacHex("psk-secret", "other", proof,),).toBe(false,);
    expect(await verifyMeshHmacHex("psk-secret", "material", "not-hex",),).toBe(false,);
  });
});

describe("mesh reserve proof", () => {
  test("a proof over the same material verifies", async () => {
    const proof = await meshReserveProof("psk-secret", MATERIAL,);

    expect(await verifyMeshReserveProof("psk-secret", MATERIAL, proof,),).toBe(true,);
  });

  test("a proof signed with another PSK does not verify", async () => {
    const proof = await meshReserveProof("other-psk", MATERIAL,);

    expect(await verifyMeshReserveProof("psk-secret", MATERIAL, proof,),).toBe(false,);
  });

  test("tampered material does not verify", async () => {
    const proof = await meshReserveProof("psk-secret", MATERIAL,);
    const tampered: MeshReserveMaterial = { ...MATERIAL, contentHash: "content-hash-2", };

    expect(await verifyMeshReserveProof("psk-secret", tampered, proof,),).toBe(false,);
  });

  test("a missing or malformed proof does not verify", async () => {
    const [missing, malformed,] = await Promise.all([
      verifyMeshReserveProof("psk-secret", MATERIAL, undefined,),
      verifyMeshReserveProof("psk-secret", MATERIAL, 42,),
    ],);

    expect(missing,).toBe(false,);
    expect(malformed,).toBe(false,);
  });

  test("optional fields are signed, so a proof over them misses the bare material", async () => {
    const [bare, typed,] = await Promise.all([
      meshReserveProof("psk-secret", MATERIAL,),
      meshReserveProof("psk-secret", { ...MATERIAL, contentType: "text/plain", },),
    ],);

    expect(bare,).not.toBe(typed,);
    expect(await verifyMeshReserveProof("psk-secret", MATERIAL, typed,),).toBe(false,);
  });
});
