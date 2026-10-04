// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * DKIM signing hook fixtures (RFC 6376, relaxed/relaxed rsa-sha256).
 *
 * Every signature is verified INDEPENDENTLY: the test rebuilds the canonical
 * data string by hand and checks it with the public key, so the fixture
 * exercises the real crypto path, not the implementation against itself.
 */
import { describe, expect, test, } from "bun:test";
import { createHash, createVerify, generateKeyPairSync, } from "node:crypto";
import {
  DKIM_ALGORITHM,
  DKIM_CANONICALIZATION,
  type DkimSignRequest,
  type DkimSignResult,
  relaxBody,
  relaxHeaderLine,
  signDkim,
} from "./deliverability";

const { privateKey, publicKey, } = generateKeyPairSync("rsa", { modulusLength: 2048, },);

const FIXTURE: DkimSignRequest = {
  privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem", },).toString(),
  domain: "sender.example",
  selector: "test",
  signHeaders: ["from", "to", "subject", "cc",],
  headers: [
    "FROM:   Alice <alice@sender.example>",
    "To:user@loop.example",
    "Subject:Hello\t\tworld  ",
    "Date:Fri, 21 Nov 1997 09:55:06 -0600",
  ],
  body: "Hello loop-lore.\n\nSecond line with   spaces.   \n\n\n",
  timestamp: 1_700_000_000,
};

/** Relaxed-canonical form of the fixture body (LF in, CRLF out). */
const RELAXED_BODY = "Hello loop-lore.\r\n\r\nSecond line with spaces.\r\n";

/** The unsigned header value the module must produce for the fixture. */
function expectedUnsignedHeader(bh: string,): string {
  return `v=1; a=${DKIM_ALGORITHM}; c=${DKIM_CANONICALIZATION}; d=sender.example;` +
    ` s=test; t=1700000000; h=from:to:subject:cc; bh=${bh}; b=`;
}

/** Hand-built canonical DKIM data string for the fixture. */
function expectedSigningData(unsignedHeader: string, fromLine: string,): string {
  return `${fromLine}\r\nto:user@loop.example\r\nsubject:Hello world\r\ncc:\r\ndkim-signature:${unsignedHeader}`;
}

function signFixture(): Extract<DkimSignResult, { ok: true }> {
  const result = signDkim(FIXTURE,);
  if (!result.ok) { throw new Error(`fixture sign failed: ${result.message}`,); }
  return result;
}

describe("signDkim", () => {
  test("produces a signature verifiable with the public key", () => {
    const result = signFixture();
    expect(result.headerName,).toBe("DKIM-Signature",);

    const bh = createHash("sha256",).update(RELAXED_BODY,).digest("base64",);
    const unsigned = expectedUnsignedHeader(bh,);
    expect(result.headerValue.startsWith(unsigned,),).toBe(true,);
    const signature = result.headerValue.slice(unsigned.length,);
    expect(signature.length,).toBeGreaterThan(0,);

    const data = expectedSigningData(unsigned, "from:Alice <alice@sender.example>",);
    expect(createVerify("RSA-SHA256",).update(data,).verify(publicKey, signature, "base64",),).toBe(true,);
  });

  test("is deterministic for identical input", () => {
    expect(signFixture().headerValue,).toBe(signFixture().headerValue,);
  });

  test("a tampered header line fails verification", () => {
    const result = signFixture();
    const bh = createHash("sha256",).update(RELAXED_BODY,).digest("base64",);
    const unsigned = expectedUnsignedHeader(bh,);
    const signature = result.headerValue.slice(unsigned.length,);
    const data = expectedSigningData(unsigned, "from:Mallory <mallory@sender.example>",);
    expect(createVerify("RSA-SHA256",).update(data,).verify(publicKey, signature, "base64",),).toBe(false,);
  });

  test("signs the last occurrence of a duplicated header", () => {
    const result = signDkim({ ...FIXTURE, headers: [...FIXTURE.headers, "From: Bob <bob@sender.example>",], },);
    if (!result.ok) { throw new Error(result.message,); }
    const bh = createHash("sha256",).update(RELAXED_BODY,).digest("base64",);
    const unsigned = expectedUnsignedHeader(bh,);
    const signature = result.headerValue.slice(unsigned.length,);
    const bob = expectedSigningData(unsigned, "from:Bob <bob@sender.example>",);
    const alice = expectedSigningData(unsigned, "from:Alice <alice@sender.example>",);
    const verify = (data: string,) => createVerify("RSA-SHA256",).update(data,).verify(publicKey, signature, "base64",);
    expect(verify(bob,),).toBe(true,);
    expect(verify(alice,),).toBe(false,);
  });

  test("an unusable key returns a typed invalid_key failure", () => {
    const result = signDkim({ ...FIXTURE, privateKeyPem: "not a key", },);
    expect(result.ok,).toBe(false,);
    if (!result.ok) {
      expect(result.code,).toBe("invalid_key",);
      expect(result.message,).toContain("DKIM signing failed",);
    }
  });
});

describe("relaxed canonicalization", () => {
  test("header lines lowercase the name, collapse WSP, and unfold", () => {
    expect(relaxHeaderLine("FROM:  Alice <a@b>",),).toBe("from:Alice <a@b>",);
    expect(relaxHeaderLine("Subject:  Hello\t\tworld  ",),).toBe("subject:Hello world",);
    expect(relaxHeaderLine("Folded: one\r\n two",),).toBe("folded:one two",);
    expect(relaxHeaderLine("novalue",),).toBe("novalue:",);
  });

  test("body canonicalizes to CRLF with one trailing newline", () => {
    expect(relaxBody("Hello loop-lore.\n\nSecond line with   spaces.   \n\n\n",),).toBe(RELAXED_BODY,);
    expect(relaxBody("no trailing newline",),).toBe("no trailing newline\r\n",);
    expect(relaxBody("a  b\t c\r\n\r\n\r\n",),).toBe("a b c\r\n",);
    expect(relaxBody("",),).toBe("",);
    expect(relaxBody("\n\n",),).toBe("",);
  });
});
