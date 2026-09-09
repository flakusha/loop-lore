// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import {
  type ContentEnvelope,
  openEnvelope,
  sealContent,
} from "./envelope";

const SECRET = "mesh-test-psk";

async function sealed(overrides: Partial<ContentEnvelope> = {},): Promise<ContentEnvelope> {
  const envelope = await sealContent({
    id: "content-1",
    origin: "https://a.example",
    clock: 1_000,
    content: "hello mesh",
    secret: SECRET,
  },);
  return { ...envelope, ...overrides, };
}
describe("content envelopes", () => {
  test("seal → open roundtrips bytes with hash and size", async () => {
    const envelope = await sealContent({
      id: "c1",
      origin: "https://a.example",
      content: "hello mesh",
      secret: SECRET,
    },);
    expect(envelope.hash,).toHaveLength(64,);
    expect(envelope.size,).toBe(10,);
    expect(envelope.ciphertext,).not.toContain("hello",);
    const bytes = await openEnvelope(envelope, SECRET,);
    expect(new TextDecoder().decode(bytes,),).toBe("hello mesh",);
  });

  test("wrong secret fails to open", async () => {
    const envelope = await sealed();
    await expect(openEnvelope(envelope, "wrong-secret",),).rejects.toThrow();
  });

  test("tampered hash fails to open", async () => {
    const envelope = await sealed({ hash: "0".repeat(64,), },);
    await expect(openEnvelope(envelope, SECRET,),).rejects.toThrow("hash mismatch",);
  });
});
