// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Edge-case tests for crypto/e2e/wrap-sender-key.ts —
 * `wrapSenderKey` / `unwrapSenderKey` protocol branches:
 * malformed wire format, wrong keys, tampered payloads, empty
 * inputs, boundary chain keys, unicode actor ids.
 */

import { beforeEach, describe, expect, test, } from "bun:test";

import { exportPublicJwk, generateKeyPair, } from "./key-pairs";
import { unwrapSenderKey, wrapSenderKey, } from "./wrap-sender-key";

interface ActorSetup {
  id: string;
  kp: CryptoKeyPair;
  pubJwk: JsonWebKey;
}

let bob: ActorSetup;
let carol: ActorSetup;

beforeEach(async () => {
  const mk = async (id: string,): Promise<ActorSetup> => {
    const kp = await generateKeyPair({ extractable: true, },);
    return { id, kp, pubJwk: await exportPublicJwk(kp.publicKey,), };
  };

  bob = await mk("bob",);
  carol = await mk("carol",);
},);

describe("wrapSenderKey input validation", () => {
  test("rejects chainKey shorter than 32 bytes", async () => {
    for (const len of [0, 1, 31,]) {
      await expect(wrapSenderKey({
        chainKey: new Uint8Array(len,),
        recipients: [{ actorId: bob.id, staticPubJwk: bob.pubJwk, },],
      },),).rejects.toThrow(`chainKey must be 32 bytes (got ${len})`,);
    }
  });

  test("rejects chainKey longer than 32 bytes", async () => {
    for (const len of [33, 64,]) {
      await expect(wrapSenderKey({
        chainKey: new Uint8Array(len,),
        recipients: [{ actorId: bob.id, staticPubJwk: bob.pubJwk, },],
      },),).rejects.toThrow(`chainKey must be 32 bytes (got ${len})`,);
    }
  });

  test("empty recipients list returns empty wraps", async () => {
    const wraps = await wrapSenderKey({
      chainKey: crypto.getRandomValues(new Uint8Array(32,),),
      recipients: [],
    },);

    expect(wraps,).toEqual([],);
  });
});

describe("wrap wire format", () => {
  test("wrappedKey is `<nonce_b64>.<ct_b64>` with 12-byte nonce and 48-byte ct", async () => {
    const chainKey = crypto.getRandomValues(new Uint8Array(32,),);
    const wraps = await wrapSenderKey({
      chainKey,
      recipients: [{ actorId: bob.id, staticPubJwk: bob.pubJwk, },],
    },);

    const parts = wraps[0]!.wrappedKey.split(".",);
    expect(parts,).toHaveLength(2,);
    const nonce = Uint8Array.fromBase64(parts[0]!,);
    const ct = Uint8Array.fromBase64(parts[1]!,);
    expect(nonce.byteLength,).toBe(12,);
    // 32-byte chain key + 16-byte AES-GCM auth tag
    expect(ct.byteLength,).toBe(48,);
  });

  test("all-zero chain key round-trips (boundary key material)", async () => {
    const zeroKey = new Uint8Array(32,);
    const wraps = await wrapSenderKey({
      chainKey: zeroKey,
      recipients: [{ actorId: bob.id, staticPubJwk: bob.pubJwk, },],
    },);

    const recovered = await unwrapSenderKey({
      wrappedKey: wraps[0]!.wrappedKey,
      senderEphPubJwk: wraps[0]!.senderEphPubJwk,
      recipientStaticPriv: bob.kp.privateKey,
      recipientActorId: bob.id,
    },);

    expect(recovered,).toEqual(zeroKey,);
  });

  test("same actorId with two different static keys produces independently usable wraps", async () => {
    const chainKey = crypto.getRandomValues(new Uint8Array(32,),);
    const wraps = await wrapSenderKey({
      chainKey,
      recipients: [
        { actorId: bob.id, staticPubJwk: bob.pubJwk, },
        { actorId: bob.id, staticPubJwk: carol.pubJwk, },
      ],
    },);

    expect(wraps,).toHaveLength(2,);
    expect(wraps[0]!.wrappedKey,).not.toBe(wraps[1]!.wrappedKey,);
    const recBob = await unwrapSenderKey({
      wrappedKey: wraps[0]!.wrappedKey,
      senderEphPubJwk: wraps[0]!.senderEphPubJwk,
      recipientStaticPriv: bob.kp.privateKey,
      recipientActorId: bob.id,
    },);

    const recCarol = await unwrapSenderKey({
      wrappedKey: wraps[1]!.wrappedKey,
      senderEphPubJwk: wraps[1]!.senderEphPubJwk,
      recipientStaticPriv: carol.kp.privateKey,
      recipientActorId: bob.id,
    },);

    expect(recBob,).toEqual(chainKey,);
    expect(recCarol,).toEqual(chainKey,);
  });
});

describe("unicode actor ids", () => {
  test("unicode actorId round-trips through wrap + unwrap", async () => {
    const unicodeId = "actrü-🙂-演员";
    const chainKey = crypto.getRandomValues(new Uint8Array(32,),);
    const wraps = await wrapSenderKey({
      chainKey,
      recipients: [{ actorId: unicodeId, staticPubJwk: bob.pubJwk, },],
    },);

    const recovered = await unwrapSenderKey({
      wrappedKey: wraps[0]!.wrappedKey,
      senderEphPubJwk: wraps[0]!.senderEphPubJwk,
      recipientStaticPriv: bob.kp.privateKey,
      recipientActorId: unicodeId,
    },);

    expect(recovered,).toEqual(chainKey,);
  });

  test("near-miss unicode actorId fails (AAD is bound to the exact id)", async () => {
    const chainKey = crypto.getRandomValues(new Uint8Array(32,),);
    const wraps = await wrapSenderKey({
      chainKey,
      recipients: [{ actorId: "actrü-🙂", staticPubJwk: bob.pubJwk, },],
    },);

    await expect(unwrapSenderKey({
      wrappedKey: wraps[0]!.wrappedKey,
      senderEphPubJwk: wraps[0]!.senderEphPubJwk,
      recipientStaticPriv: bob.kp.privateKey,
      recipientActorId: "actrü",
    },),).rejects.toThrow();
  });
});

describe("unwrapSenderKey malformed wire format", () => {
  const good = async (): Promise<{ wrappedKey: string; senderEphPubJwk: JsonWebKey }> => {
    const chainKey = crypto.getRandomValues(new Uint8Array(32,),);
    const wraps = await wrapSenderKey({
      chainKey,
      recipients: [{ actorId: bob.id, staticPubJwk: bob.pubJwk, },],
    },);

    return {
      wrappedKey: wraps[0]!.wrappedKey,
      senderEphPubJwk: wraps[0]!.senderEphPubJwk,
    };
  };

  test("empty string throws wire-format error", async () => {
    const g = await good();
    await expect(unwrapSenderKey({
      wrappedKey: "",
      senderEphPubJwk: g.senderEphPubJwk,
      recipientStaticPriv: bob.kp.privateKey,
      recipientActorId: bob.id,
    },),).rejects.toThrow(/wrap wire format invalid/,);
  });

  test("missing dot throws wire-format error", async () => {
    const g = await good();
    await expect(unwrapSenderKey({
      wrappedKey: "nodots",
      senderEphPubJwk: g.senderEphPubJwk,
      recipientStaticPriv: bob.kp.privateKey,
      recipientActorId: bob.id,
    },),).rejects.toThrow(/wrap wire format invalid/,);
  });

  test("too many dots throws wire-format error", async () => {
    const g = await good();
    await expect(unwrapSenderKey({
      wrappedKey: "a.b.c",
      senderEphPubJwk: g.senderEphPubJwk,
      recipientStaticPriv: bob.kp.privateKey,
      recipientActorId: bob.id,
    },),).rejects.toThrow(/wrap wire format invalid/,);
  });

  test("invalid base64 in nonce part throws", async () => {
    const g = await good();
    await expect(unwrapSenderKey({
      wrappedKey: "***.***",
      senderEphPubJwk: g.senderEphPubJwk,
      recipientStaticPriv: bob.kp.privateKey,
      recipientActorId: bob.id,
    },),).rejects.toThrow();
  });

  test("valid base64 but wrong nonce length throws", async () => {
    const g = await good();
    const shortNonce = crypto.getRandomValues(new Uint8Array(11,),).toBase64();
    const ctB64 = g.wrappedKey.split(".",)[1]!;
    await expect(unwrapSenderKey({
      wrappedKey: `${shortNonce}.${ctB64}`,
      senderEphPubJwk: g.senderEphPubJwk,
      recipientStaticPriv: bob.kp.privateKey,
      recipientActorId: bob.id,
    },),).rejects.toThrow(/wrap nonce must be 12 bytes/,);
  });

  test("swapped nonce/ct parts throws (ct is not a 12-byte nonce)", async () => {
    const g = await good();
    const [nonceB64, ctB64,] = g.wrappedKey.split(".",);
    await expect(unwrapSenderKey({
      wrappedKey: `${ctB64}.${nonceB64}`,
      senderEphPubJwk: g.senderEphPubJwk,
      recipientStaticPriv: bob.kp.privateKey,
      recipientActorId: bob.id,
    },),).rejects.toThrow(/wrap nonce must be 12 bytes/,);
  });

  test("empty ciphertext part throws (AES-GCM auth failure)", async () => {
    const g = await good();
    const nonceB64 = g.wrappedKey.split(".",)[0]!;
    await expect(unwrapSenderKey({
      wrappedKey: `${nonceB64}.`,
      senderEphPubJwk: g.senderEphPubJwk,
      recipientStaticPriv: bob.kp.privateKey,
      recipientActorId: bob.id,
    },),).rejects.toThrow();
  });
});

describe("unwrapSenderKey tampering + wrong-key authentication", () => {
  const good = async (): Promise<{ wrappedKey: string; senderEphPubJwk: JsonWebKey }> => {
    const chainKey = crypto.getRandomValues(new Uint8Array(32,),);
    const wraps = await wrapSenderKey({
      chainKey,
      recipients: [{ actorId: bob.id, staticPubJwk: bob.pubJwk, },],
    },);

    return {
      wrappedKey: wraps[0]!.wrappedKey,
      senderEphPubJwk: wraps[0]!.senderEphPubJwk,
    };
  };

  test("flipping a ciphertext byte throws", async () => {
    const g = await good();
    const [nonceB64, ctB64,] = g.wrappedKey.split(".",);
    const ct = Uint8Array.fromBase64(ctB64!,);
    ct[ct.length - 1] = (ct[ct.length - 1] ?? 0) ^ 0x01;
    await expect(unwrapSenderKey({
      wrappedKey: `${nonceB64}.${ct.toBase64()}`,
      senderEphPubJwk: g.senderEphPubJwk,
      recipientStaticPriv: bob.kp.privateKey,
      recipientActorId: bob.id,
    },),).rejects.toThrow();
  });

  test("flipping a nonce byte throws", async () => {
    const g = await good();
    const [nonceB64, ctB64,] = g.wrappedKey.split(".",);
    const nonce = Uint8Array.fromBase64(nonceB64!,);
    nonce[0] = (nonce[0] ?? 0) ^ 0x01;
    await expect(unwrapSenderKey({
      wrappedKey: `${nonce.toBase64()}.${ctB64}`,
      senderEphPubJwk: g.senderEphPubJwk,
      recipientStaticPriv: bob.kp.privateKey,
      recipientActorId: bob.id,
    },),).rejects.toThrow();
  });

  test("correct key but wrong recipientActorId throws (AAD mismatch)", async () => {
    const g = await good();
    await expect(unwrapSenderKey({
      wrappedKey: g.wrappedKey,
      senderEphPubJwk: g.senderEphPubJwk,
      recipientStaticPriv: bob.kp.privateKey,
      recipientActorId: "alice",
    },),).rejects.toThrow();
  });

  test("wrong static private key throws", async () => {
    const g = await good();
    await expect(unwrapSenderKey({
      wrappedKey: g.wrappedKey,
      senderEphPubJwk: g.senderEphPubJwk,
      recipientStaticPriv: carol.kp.privateKey,
      recipientActorId: bob.id,
    },),).rejects.toThrow();
  });
});
