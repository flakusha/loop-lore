// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Credential store: raw secrets never persist; verify/revoke round-trip.
import { describe, expect, test, } from "bun:test";
import { revokeCredential, storeCredential, verifyCredential, } from "./credential-store";

const SECRET = "sk-live-test-secret-value";

describe("credential-store", () => {
  test("stored ref never contains the raw secret", async () => {
    const ref = await storeCredential(SECRET,);
    expect(ref,).not.toContain(SECRET,);
    expect(ref.startsWith("sha256:",),).toBe(true,);
  });

  test("verify round-trips: match true, wrong secret false", async () => {
    const ref = await storeCredential(SECRET,);
    expect(await verifyCredential(SECRET, ref,),).toBe(true,);
    expect(await verifyCredential("sk-wrong", ref,),).toBe(false,);
  });

  test("wrapped envelope round-trips without exposing the secret", async () => {
    const ref = await storeCredential(SECRET, "server-wrap-key",);
    expect(ref,).not.toContain(SECRET,);
    expect(await verifyCredential(SECRET, ref, "server-wrap-key",),).toBe(true,);
    expect(await verifyCredential(SECRET, ref, "wrong-wrap-key",),).toBe(false,);
    expect(await verifyCredential("sk-wrong", ref, "server-wrap-key",),).toBe(false,);
  });

  test("empty wrapSecret throws instead of sealing weakly", async () => {
    let thrown: unknown;
    try {
      await storeCredential(SECRET, "",);
    } catch (error) {
      thrown = error;
    }

    expect(thrown,).toBeInstanceOf(Error,);
  });

  test("revoke returns a tombstone marker", () => {
    const ref = "sha256:abc123";
    expect(revokeCredential(ref,),).toBe(`revoked:${ref}`,);
  });
});
