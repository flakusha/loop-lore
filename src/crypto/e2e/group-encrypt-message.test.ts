// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { beforeEach, describe, expect, test, } from "bun:test";

import {
  decryptGroupMessage,
  encryptGroupMessage,
  type GroupEncryptedPayload,
} from "./group-encrypt-message";
import { exportPublicJwk, generateKeyPair, } from "./key-pairs";
import { unwrapSenderKey, wrapSenderKey, } from "./wrap-sender-key";

interface ActorSetup {
  id: string;
  kp: CryptoKeyPair;
  pubJwk: JsonWebKey;
}

let alice: ActorSetup;
let bob: ActorSetup;
let carol: ActorSetup;

beforeEach(async () => {
  const mk = async (id: string,): Promise<ActorSetup> => {
    const kp = await generateKeyPair({ extractable: true, },);
    return { id, kp, pubJwk: await exportPublicJwk(kp.publicKey,), };
  };
  alice = await mk("alice",);
  bob = await mk("bob",);
  carol = await mk("carol",);
},);

describe("wrap / unwrap sender chain key", () => {
  test("wrapping + unwrapping round-trip", async () => {
    const chainKey = crypto.getRandomValues(new Uint8Array(32,),);
    const wraps = await wrapSenderKey({
      chainKey,
      recipients: [{ actorId: bob.id, staticPubJwk: bob.pubJwk, },],
    },);
    expect(wraps,).toHaveLength(1,);
    expect(wraps[0]?.recipientActorId,).toBe(bob.id,);
    expect(wraps[0]?.wrappedKey,).toBeTruthy();
    expect(wraps[0]?.wrappedKey,).not.toBe(chainKey.toBase64(),);

    const recovered = await unwrapSenderKey({
      wrappedKey: wraps[0]!.wrappedKey,
      senderEphPubJwk: wraps[0]!.senderEphPubJwk,
      recipientStaticPriv: bob.kp.privateKey,
      recipientActorId: bob.id,
    },);
    expect(recovered,).toEqual(chainKey,);
  },);

  test("multiple recipients get distinct wraps + each can unwrap independently", async () => {
    const chainKey = crypto.getRandomValues(new Uint8Array(32,),);
    const wraps = await wrapSenderKey({
      chainKey,
      recipients: [
        { actorId: bob.id, staticPubJwk: bob.pubJwk, },
        { actorId: carol.id, staticPubJwk: carol.pubJwk, },
      ],
    },);
    expect(wraps,).toHaveLength(2,);
    expect(wraps[0]!.wrappedKey,).not.toBe(wraps[1]!.wrappedKey,);
    expect(JSON.stringify(wraps[0]!.senderEphPubJwk,),)
      .not.toBe(JSON.stringify(wraps[1]!.senderEphPubJwk,),);

    const bobRec = await unwrapSenderKey({
      wrappedKey: wraps[0]!.wrappedKey,
      senderEphPubJwk: wraps[0]!.senderEphPubJwk,
      recipientStaticPriv: bob.kp.privateKey,
      recipientActorId: bob.id,
    },);
    const carolRec = await unwrapSenderKey({
      wrappedKey: wraps[1]!.wrappedKey,
      senderEphPubJwk: wraps[1]!.senderEphPubJwk,
      recipientStaticPriv: carol.kp.privateKey,
      recipientActorId: carol.id,
    },);
    expect(bobRec,).toEqual(chainKey,);
    expect(carolRec,).toEqual(chainKey,);
  },);

  test("wrong recipient key fails to unwrap (auth-tag mismatch)", async () => {
    const chainKey = crypto.getRandomValues(new Uint8Array(32,),);
    const wraps = await wrapSenderKey({
      chainKey,
      recipients: [{ actorId: bob.id, staticPubJwk: bob.pubJwk, },],
    },);
    await expect(
      unwrapSenderKey({
        wrappedKey: wraps[0]!.wrappedKey,
        senderEphPubJwk: wraps[0]!.senderEphPubJwk,
        recipientStaticPriv: carol.kp.privateKey,
        recipientActorId: carol.id,
      },),
    ).rejects.toThrow();
  },);
});

describe("group message encrypt + decrypt", () => {
  test("3-recipient group: each can decrypt the same ciphertext", async () => {
    const wire = await encryptGroupMessage({
      plaintext: "hello team",
      chainIndex: 0,
      recipients: [
        { actorId: alice.id, staticPubJwk: alice.pubJwk, },
        { actorId: bob.id, staticPubJwk: bob.pubJwk, },
        { actorId: carol.id, staticPubJwk: carol.pubJwk, },
      ],
    },);
    expect(wire.ciphertext,).toBeTruthy();
    expect(wire.nonce,).toBeTruthy();
    expect(wire.chainIndex,).toBe(0,);
    expect(Object.keys(wire.per_recipient,),).toHaveLength(3,);

    for (const setup of [alice, bob, carol]) {
      const pt = await decryptGroupMessage({
        payload: wire,
        recipientActorId: setup.id,
        recipientStaticPriv: setup.kp.privateKey,
      },);
      expect(pt,).toBe("hello team",);
    }
  },);

  test("non-recipient gets an error (no wrap for them)", async () => {
    const wire = await encryptGroupMessage({
      plaintext: "private",
      chainIndex: 0,
      recipients: [
        { actorId: bob.id, staticPubJwk: bob.pubJwk, },
        { actorId: carol.id, staticPubJwk: carol.pubJwk, },
      ],
    },);
    await expect(
      decryptGroupMessage({
        payload: wire,
        recipientActorId: "eve",
        recipientStaticPriv: alice.kp.privateKey,
      },),
    ).rejects.toThrow(/no wrap found/);
  },);

  test("substituting another recipient's wrap produces wrong chain key → AES-GCM auth failure", async () => {
    const wire = await encryptGroupMessage({
      plaintext: "sub",
      chainIndex: 0,
      recipients: [
        { actorId: bob.id, staticPubJwk: bob.pubJwk, },
        { actorId: carol.id, staticPubJwk: carol.pubJwk, },
      ],
    },);
    const carolWrap = wire.per_recipient["carol"]!;
    const tampered: GroupEncryptedPayload = {
      ...wire,
      per_recipient: { ...wire.per_recipient, bob: carolWrap, },
    };
    expect(
      decryptGroupMessage({
        payload: tampered,
        recipientActorId: "bob",
        recipientStaticPriv: bob.kp.privateKey,
      },),
    ).rejects.toThrow();
  },);

  test("tampered ciphertext throws (AES-GCM auth-tag mismatch)", async () => {
    const wire = await encryptGroupMessage({
      plaintext: "tamper me",
      chainIndex: 7,
      recipients: [{ actorId: bob.id, staticPubJwk: bob.pubJwk, },],
    },);
    const ct = Uint8Array.fromBase64(wire.ciphertext,);
    const idx = Math.min(2, ct.length - 1,);
    ct[idx] = (ct[idx] ?? 0) ^ 0x01;
    expect(
      decryptGroupMessage({
        payload: { ...wire, ciphertext: ct.toBase64(), },
        recipientActorId: bob.id,
        recipientStaticPriv: bob.kp.privateKey,
      },),
    ).rejects.toThrow();
  },);

  test("each send uses a fresh sender chain key (no replay of past keys)", async () => {
    const w1 = await encryptGroupMessage({
      plaintext: "first",
      chainIndex: 0,
      recipients: [{ actorId: bob.id, staticPubJwk: bob.pubJwk, },],
    },);
    const w2 = await encryptGroupMessage({
      plaintext: "second",
      chainIndex: 1,
      recipients: [{ actorId: bob.id, staticPubJwk: bob.pubJwk, },],
    },);
    expect(w1.per_recipient["bob"]!.wrappedKey,).not.toBe(
      w2.per_recipient["bob"]!.wrappedKey,
    );
    expect(
      await decryptGroupMessage({
        payload: w1,
        recipientActorId: bob.id,
        recipientStaticPriv: bob.kp.privateKey,
      },),
    ).toBe("first",);
    expect(
      await decryptGroupMessage({
        payload: w2,
        recipientActorId: bob.id,
        recipientStaticPriv: bob.kp.privateKey,
      },),
    ).toBe("second",);
  },);
});
