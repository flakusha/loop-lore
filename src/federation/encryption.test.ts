// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { beforeAll, describe, expect, test, } from "bun:test";
import { getSmk, initSmk, } from "../crypto/smk";
import { createTestDb, } from "../test-utils/create-test-db";
import { pskCipher, } from "./cipher";
import { createMeshEncryption, } from "./encryption";
import { getOrCreateInboundKey, } from "./peer-keys";

const SECRET = "mesh-test-psk";
const KEY = Buffer.from("k".repeat(32,),).toString("base64",);

beforeAll(async () => {
  await initSmk({
    serverEncryptionKey: "b".repeat(64,),
    required: false,
    compressThreshold: 128,
    compressAlgorithm: "gzip",
  },);
},);

describe("mesh encryption provider", () => {
  test("contentCipher prefers the issued key over the PSK", async () => {
    const encryption = createMeshEncryption(SECRET,);
    const sealed = await encryption.contentCipher(KEY,).seal(
      new TextEncoder().encode("key-sealed",),
    );
    // Issued-key ciphertext never opens under the PSK …
    await expect(encryption.psk.open(sealed,),).rejects.toThrow();
    // … but opens under the issued key.
    const bytes = await pskCipher(KEY,).open(sealed,);
    expect(new TextDecoder().decode(bytes,),).toBe("key-sealed",);
  });

  test("contentCipher without a key is the PSK cipher", async () => {
    const encryption = createMeshEncryption(SECRET,);
    expect(encryption.contentCipher(undefined,),).toBe(encryption.psk,);
  });

  test("receiverCiphers tries inbound keys before the PSK", async () => {
    const { db, } = await createTestDb();
    const smk = getSmk();
    if (smk === null) { throw new Error("SMK not initialized",); }
    await getOrCreateInboundKey(db, smk, "https://a.example",);
    const encryption = createMeshEncryption(SECRET,);
    const ciphers = await encryption.receiverCiphers(db, "https://a.example", smk,);
    expect(ciphers,).toHaveLength(2,);
    const sealed = await ciphers[0]!.seal(new TextEncoder().encode("inbound",),);
    await expect(encryption.psk.open(sealed,),).rejects.toThrow();
  });

  test("receiverCiphers is PSK-only without an SMK", async () => {
    const { db, } = await createTestDb();
    const encryption = createMeshEncryption(SECRET,);
    const ciphers = await encryption.receiverCiphers(db, "https://a.example", null,);
    expect(ciphers,).toEqual([encryption.psk,],);
  });
});
