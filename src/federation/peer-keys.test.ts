// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { beforeAll, describe, expect, test, } from "bun:test";
import { initSmk, } from "../crypto/smk";
import { createTestDb, } from "../test-utils/create-test-db";
import { pskCipher, } from "./cipher";
import { openEnvelope, sealContent, } from "./envelope";
import {
  ciphersForSender,
  generateInboundKey,
  getOrCreateInboundKey,
  inboundCiphers,
  revokeInboundKey,
  rotateInboundKey,
} from "./peer-keys";

const SMK_HEX = "b".repeat(64,);

beforeAll(async () => {
  await initSmk({
    serverEncryptionKey: SMK_HEX,
    required: false,
    compressThreshold: 128,
    compressAlgorithm: "gzip",
  },);
},);

async function smk(): Promise<CryptoKey> {
  const { getSmk, } = await import("../crypto/smk");
  const key = getSmk();
  if (key === null) { throw new Error("SMK not initialized",); }
  return key;
}

describe("per-sender inbound keys", () => {
  test("provision is stable; rotation keeps a grace key", async () => {
    const { db, } = await createTestDb();
    const key = await smk();
    const first = await getOrCreateInboundKey(db, key, "https://a.example",);
    expect(first,).toHaveLength(44,);
    expect(await getOrCreateInboundKey(db, key, "https://a.example",),).toBe(first,);
    expect(await getOrCreateInboundKey(db, key, "https://b.example",),).not.toBe(first,);

    const rotated = await rotateInboundKey(db, key, "https://a.example",);
    expect(rotated,).not.toBe(first,);
    const ciphers = await inboundCiphers(db, key, "https://a.example",);
    expect(ciphers,).toHaveLength(2,);

    // Old key still opens (grace), new key seals.
    const plaintext = "grace payload";
    const sealedOld = await sealContent({
      id: "g1",
      origin: "https://a.example",
      content: plaintext,
      cipher: pskCipher(first,),
    },);
    expect(new TextDecoder().decode(await openEnvelope(sealedOld, ciphers[1]!,),),).toBe(
      plaintext,
    );
    const sealedNew = await sealContent({
      id: "g2",
      origin: "https://a.example",
      content: plaintext,
      cipher: pskCipher(rotated,),
    },);
    expect(new TextDecoder().decode(await openEnvelope(sealedNew, ciphers[0]!,),),).toBe(
      plaintext,
    );
  });

  test("ciphersForSender falls back to PSK without SMK or keys", async () => {
    const { db, } = await createTestDb();
    const key = await smk();
    const psk = pskCipher("fallback",);
    expect(await ciphersForSender(db, "https://new.example", psk, null,),).toEqual([psk,],);
    expect(await ciphersForSender(db, "https://new.example", psk, key,),).toEqual([psk,],);
    await getOrCreateInboundKey(db, key, "https://new.example",);
    expect((await ciphersForSender(db, "https://new.example", psk, key,)).length,).toBe(2,);
    expect(await inboundCiphers(db, key, "not a url",),).toEqual([],);
  });

  test("revoke drops current + grace keys; unknown peer is a no-op", async () => {
    const { db, } = await createTestDb();
    const key = await smk();
    await getOrCreateInboundKey(db, key, "https://a.example",);
    await rotateInboundKey(db, key, "https://a.example",);
    expect(await inboundCiphers(db, key, "https://a.example",),).toHaveLength(2,);
    await revokeInboundKey(db, "https://a.example",);
    expect(await inboundCiphers(db, key, "https://a.example",),).toEqual([],);
    // Unknown peer revoke succeeds without effect (idempotent).
    await revokeInboundKey(db, "https://ghost.example",);
    expect(await inboundCiphers(db, key, "https://ghost.example",),).toEqual([],);
  });

  test("invalid origins throw", async () => {
    const { db, } = await createTestDb();
    const key = await smk();
    await expect(getOrCreateInboundKey(db, key, "not a url",),).rejects.toThrow(
      "invalid sender origin",
    );
    await expect(rotateInboundKey(db, key, "not a url",),).rejects.toThrow(
      "invalid sender origin",
    );
    await expect(revokeInboundKey(db, "not a url",),).rejects.toThrow(
      "invalid sender origin",
    );
    expect(generateInboundKey(),).toHaveLength(44,);
  });
});
