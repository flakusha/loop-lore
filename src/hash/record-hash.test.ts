// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import {
  asTableName,
  canonicalJSON,
  computeRecordHash,
  fastKeyHash,
  RECORD_HASH_VERSION,
} from "./record-hash";

describe("canonicalJSON", () => {
  test("sorts keys at every level", () => {
    expect(canonicalJSON({ b: 1, a: 2, },),).toBe(`{"a":2,"b":1}`,);
    expect(canonicalJSON({ z: { y: 1, x: 2, }, a: 3, },),).toBe(`{"a":3,"z":{"x":2,"y":1}}`,);
  });

  test("key order does not affect output", () => {
    const a = canonicalJSON({ chat_id: "c1", author_id: "u2", body: "hi", v: 1, },);
    const b = canonicalJSON({ v: 1, body: "hi", author_id: "u2", chat_id: "c1", },);
    expect(a,).toBe(b,);
  });

  test("whitespace and indentation do not affect output", () => {
    const compact = canonicalJSON({ chat_id: "c1", author_id: "u2", },);
    expect(compact,).toBe(`{"author_id":"u2","chat_id":"c1"}`,);
  });

  test("arrays preserve order", () => {
    expect(canonicalJSON([1, 2, 3,],),).toBe("[1,2,3]",);
    expect(canonicalJSON([3, 2, 1,],),).toBe("[3,2,1]",);
  });

  test("null and undefined map to null", () => {
    expect(canonicalJSON(null,),).toBe("null",);
    expect(canonicalJSON(undefined,),).toBe("null",);
    expect(canonicalJSON({ a: null, b: undefined, },),).toBe(`{"a":null}`,);
  });

  test("rejects cyclic references", () => {
    const a: Record<string, unknown> = {};
    a.self = a;
    expect(() => canonicalJSON(a,)).toThrow(/cyclic/,);
  });

  test("Number.NaN + Infinity map to null", () => {
    expect(canonicalJSON(Number.NaN,),).toBe("null",);
    expect(canonicalJSON(Infinity,),).toBe("null",);
    expect(canonicalJSON(-Infinity,),).toBe("null",);
  });

  test("Date coerces to ISO string", () => {
    const iso = "2026-08-27T08:00:00.000Z";
    expect(canonicalJSON(new Date(iso,),),).toBe(JSON.stringify(iso,),);
  });

  test("BigInt coerces to string", () => {
    expect(canonicalJSON(123n,),).toBe(`"123"`,);
  });
});

describe("computeRecordHash", () => {
  const table = asTableName("messages",);
  const pk = "m-1";
  const inputs = {
    chat_id: "c1",
    author_id: "u2",
    body: "hello",
    idempotency_key: "k1",
    created_at: "2026-08-27T08:00:00.000Z",
  };

  test("is deterministic across calls", () => {
    const a = computeRecordHash(table, pk, inputs,);
    const b = computeRecordHash(table, pk, inputs,);
    expect(a,).toBe(b,);
  });

  test("returns 64-char lowercase hex", () => {
    const h = computeRecordHash(table, pk, inputs,);
    expect(h,).toMatch(/^[0-9a-f]{64}$/,);
  });

  test("input key order does not matter", () => {
    const reordered = {
      created_at: "2026-08-27T08:00:00.000Z",
      idempotency_key: "k1",
      body: "hello",
      author_id: "u2",
      chat_id: "c1",
    };
    expect(computeRecordHash(table, pk, inputs,),).toBe(computeRecordHash(table, pk, reordered,),);
  });

  test("bumping RECORD_HASH_VERSION changes the hash", () => {
    // Sanity: the constant is `1` today. If we ever bump it the test file
    // should fail loud so we update fixtures.
    expect(RECORD_HASH_VERSION,).toBe(1,);
    const before = computeRecordHash(table, pk, inputs,);
    // The hash IS expected to change if we mutate the version constant —
    // confirm via a contrived envelope with v=2.
    const envelopeV2 = `${table}|${pk}|${canonicalJSON({ v: 2, ...inputs, },)}`;
    const manualV2 = new Bun.CryptoHasher("sha256",).update(envelopeV2,).digest("hex",);
    expect(before,).not.toBe(manualV2,);
  });

  test("different PK gives different hash", () => {
    expect(computeRecordHash(table, pk, inputs,),).not.toBe(computeRecordHash(table, "m-2", inputs,),);
  });

  test("different table gives different hash", () => {
    expect(computeRecordHash(table, pk, inputs,),).not.toBe(
      computeRecordHash(asTableName("messages_archive",), pk, inputs,),
    );
  });

  test("rejects non-lowercase table name", () => {
    expect(() => asTableName("Messages",)).toThrow(/lowercase/,);
    expect(() => asTableName("",)).toThrow(/empty/,);
  });

  test("canonical SHA-256 fixture matches a known vector", () => {
    // Build the envelope the SAME WAY computeRecordHash does (with v stamped)
    // so we can assert byte-equivalence against an independently-computed SHA-256.
    const envelope = 'users|u1|{"email":"a@b","name":"u","v":1}';
    const expected = new Bun.CryptoHasher("sha256",).update(envelope,).digest("hex",);
    const got = computeRecordHash(asTableName("users",), "u1", { email: "a@b", name: "u", },);
    expect(got,).toBe(expected,);
  });
});

describe("fastKeyHash", () => {
  test("is order-sensitive", () => {
    expect(fastKeyHash("a", "b",),).not.toBe(fastKeyHash("b", "a",),);
  });

  test("is deterministic", () => {
    expect(fastKeyHash("x", "y",),).toBe(fastKeyHash("x", "y",),);
  });
});
