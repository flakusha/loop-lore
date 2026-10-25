// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/federation/mesh-proof.test.ts — the mesh reserve proof must verify only
// the exact material the sender signed: a tampered reservation, a foreign
// PSK, or a malformed proof must never pass.
import { describe, expect, test, } from "bun:test";
import { type MeshReserveMaterial, meshReserveProof, verifyMeshReserveProof, } from "./mesh-proof";

const MATERIAL: MeshReserveMaterial = {
  senderOrigin: "https://peer.example",
  contentHash: "content-hash-1",
  sizeBytes: 1024,
};

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
    expect(await verifyMeshReserveProof("psk-secret", MATERIAL, undefined,),).toBe(false,);
    expect(await verifyMeshReserveProof("psk-secret", MATERIAL, 42,),).toBe(false,);
  });

  test("optional fields are signed, so a proof over them misses the bare material", async () => {
    const bare = await meshReserveProof("psk-secret", MATERIAL,);
    const typed = await meshReserveProof("psk-secret", { ...MATERIAL, contentType: "text/plain", },);

    expect(bare,).not.toBe(typed,);
    expect(await verifyMeshReserveProof("psk-secret", MATERIAL, typed,),).toBe(false,);
  });
});
