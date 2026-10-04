// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for integrations/secrets.ts — encrypted credential envelope.
 *
 * All key material is generated locally (WebCrypto AES-GCM); tests are
 * deterministic and need no network, no env vars, and no SMK state.
 * Plaintext credentials below are fixtures — none may ever leak into a
 * sealed blob, an error, or a redacted record.
 */
import { describe, expect, test, } from "bun:test";
import type { SecretEnvelopeCode, } from "./secrets";
import {
  openCredential,
  redactCredentials,
  REDACTED_MARKER,
  resolveCredential,
  rewrapCredential,
  sealCredential,
  SecretEnvelopeError,
} from "./secrets";

const PLAIN = "s3cure-hunter2-plaintext";
const REF_HEAD = "secret:v1:";

/** Fresh AES-256-GCM key standing in for SMK material. */
function makeKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256, }, true, ["encrypt", "decrypt",],);
}

/** Run an envelope operation that must fail and report its typed code. */
async function envelopeCode(run: () => Promise<unknown>,): Promise<SecretEnvelopeCode> {
  try {
    await run();
  } catch (error) {
    if (error instanceof SecretEnvelopeError) { return error.code; }
    throw error;
  }

  throw new Error("expected a SecretEnvelopeError",);
}

/** Flip the first ciphertext char — valid base64, padding safe, tag broken. */
function tamperFirstChar(ref: string,): string {
  const parts = ref.slice(REF_HEAD.length,).split(":",);
  const ct = parts[1]!;
  const flipped = ct.startsWith("A",) ? "B" : "A";
  return `${REF_HEAD}${flipped}${ct.slice(1,)}:${parts[0]!}`;
}

describe("sealCredential", () => {
  test("seals to an opaque secret:v1 reference containing no plaintext", async () => {
    const key = await makeKey();
    const ref = await sealCredential(PLAIN, { smk: () => key, },);
    expect(ref.startsWith(REF_HEAD,),).toBe(true,);
    expect(ref,).not.toBe(PLAIN,);
    expect(ref.includes(PLAIN,),).toBe(false,);
    expect(ref.slice(REF_HEAD.length,).split(":",),).toHaveLength(2,);
  });

  test("round-trips through openCredential", async () => {
    const key = await makeKey();
    const ref = await sealCredential(PLAIN, { smk: () => key, },);
    await expect(openCredential(ref, { smk: () => key, },),).resolves.toBe(PLAIN,);
  });

  test("refuses to seal an existing reference (double-wrap guard)", async () => {
    const key = await makeKey();
    const code = await envelopeCode(() => sealCredential("secret:v1:aa:bb", { smk: () => key, },));
    expect(code,).toBe("malformed",);
  });

  test("throws unavailable when no key material exists", async () => {
    expect(await envelopeCode(() => sealCredential(PLAIN, { smk: () => null, },)),).toBe("unavailable",);
  });
});

describe("openCredential", () => {
  test("tampered ciphertext fails authentication with a typed error", async () => {
    const key = await makeKey();
    const ref = await sealCredential(PLAIN, { smk: () => key, },);
    expect(await envelopeCode(() => openCredential(tamperFirstChar(ref,), { smk: () => key, },)),).toBe("tampered",);
  });

  test("wrong key material fails authentication the same way", async () => {
    const keyA = await makeKey();
    const keyB = await makeKey();
    const ref = await sealCredential(PLAIN, { smk: () => keyA, },);
    expect(await envelopeCode(() => openCredential(ref, { smk: () => keyB, },)),).toBe("tampered",);
  });

  test("rejects malformed references with code malformed", async () => {
    const key = await makeKey();
    const opts = { smk: () => key, };
    expect(await envelopeCode(() => openCredential("just-a-password", opts,)),).toBe("malformed",);
    expect(await envelopeCode(() => openCredential("secret:v2:aa:bb", opts,)),).toBe("malformed",);
    expect(await envelopeCode(() => openCredential("secret:v1:onlychunk", opts,)),).toBe("malformed",);
    expect(await envelopeCode(() => openCredential("secret:v1::", opts,)),).toBe("malformed",);
    expect(await envelopeCode(() => openCredential("secret:v1:!!!:???", opts,)),).toBe("malformed",);
  });

  test("error is a SecretEnvelopeError (Error subclass, name set)", async () => {
    const key = await makeKey();
    const error = await openCredential("secret:v1:!!:??", { smk: () => key, },).then(
      () => null,
      (e: unknown,) => e,
    );

    expect(error,).toBeInstanceOf(SecretEnvelopeError,);
    expect(error,).toBeInstanceOf(Error,);
    expect((error as SecretEnvelopeError).name,).toBe("SecretEnvelopeError",);
    expect((error as SecretEnvelopeError).message.includes(PLAIN,),).toBe(false,);
  });
});

describe("resolveCredential", () => {
  test("raw configured value passes through without any key material", async () => {
    await expect(resolveCredential("plain-raw", { smk: () => null, },),).resolves.toBe("plain-raw",);
  });

  test("secret: reference resolves back to the plaintext", async () => {
    const key = await makeKey();
    const ref = await sealCredential(PLAIN, { smk: () => key, },);
    await expect(resolveCredential(ref, { smk: () => key, },),).resolves.toBe(PLAIN,);
  });

  test("structurally valid but unopenable reference raises the typed error", async () => {
    const key = await makeKey();
    const code = await envelopeCode(
      () => resolveCredential("secret:v1:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA", { smk: () => key, },),
    );

    expect(code,).toBe("tampered",);
  });
});

describe("rewrapCredential", () => {
  test("round-trips under new key material", async () => {
    const keyA = await makeKey();
    const keyB = await makeKey();
    const ref = await sealCredential(PLAIN, { smk: () => keyA, },);
    const rewrapped = await rewrapCredential(ref, { from: () => keyA, to: () => keyB, },);
    expect(rewrapped.startsWith(REF_HEAD,),).toBe(true,);
    expect(rewrapped,).not.toBe(ref,);
    await expect(openCredential(rewrapped, { smk: () => keyB, },),).resolves.toBe(PLAIN,);
  });

  test("old envelope is unreadable after rotation to the new key", async () => {
    const keyA = await makeKey();
    const keyB = await makeKey();
    const ref = await sealCredential(PLAIN, { smk: () => keyA, },);
    await rewrapCredential(ref, { from: () => keyA, to: () => keyB, },);
    expect(await envelopeCode(() => openCredential(ref, { smk: () => keyB, },)),).toBe("tampered",);
  });

  test("rewrapped envelope is unreadable under the old key", async () => {
    const keyA = await makeKey();
    const keyB = await makeKey();
    const ref = await sealCredential(PLAIN, { smk: () => keyA, },);
    const rewrapped = await rewrapCredential(ref, { from: () => keyA, to: () => keyB, },);
    expect(await envelopeCode(() => openCredential(rewrapped, { smk: () => keyA, },)),).toBe("tampered",);
  });

  test("to defaults to from (rewrap under the same key material)", async () => {
    const keyA = await makeKey();
    const ref = await sealCredential(PLAIN, { smk: () => keyA, },);
    const rewrapped = await rewrapCredential(ref, { from: () => keyA, },);
    await expect(openCredential(rewrapped, { smk: () => keyA, },),).resolves.toBe(PLAIN,);
  });

  test("surfaces unavailable when the target key material is missing", async () => {
    const keyA = await makeKey();
    const ref = await sealCredential(PLAIN, { smk: () => keyA, },);
    const code = await envelopeCode(() => rewrapCredential(ref, { from: () => keyA, to: () => null, },));
    expect(code,).toBe("unavailable",);
  });
});

describe("redactCredentials", () => {
  test("redacts every sensitive kind in a nested config record, leaks no plaintext", async () => {
    const key = await makeKey();
    const sealedToken = await sealCredential("matrix-syt-token", { smk: () => key, },);
    const record = {
      email: { imapHost: "imap.example", imapPort: 993, imapPass: "pw-imap", smtpPass: "pw-smtp", },
      matrix: { homeserver: "https://matrix.example", accessToken: sealedToken, },
      xmpp: { jid: "bot@example", password: "pw-xmpp", },
      telegram: { botToken: "1234:AAFF", },
      nostr: { privateKey: "nsec1fixture", relayUrls: ["wss://relay1", "wss://relay2",], },
      webhook: { secret: "hmac-secret", path: "/api/v1/integrations/webhooks/telegram", },
      legacyToken: "kept-noncredential",
    };

    const redacted = redactCredentials(record,);
    expect(redacted.email.imapPass,).toBe(REDACTED_MARKER,);
    expect(redacted.email.smtpPass,).toBe(REDACTED_MARKER,);
    expect(redacted.matrix.accessToken,).toBe(REDACTED_MARKER,);
    expect(redacted.xmpp.password,).toBe(REDACTED_MARKER,);
    expect(redacted.telegram.botToken,).toBe(REDACTED_MARKER,);
    expect(redacted.nostr.privateKey,).toBe(REDACTED_MARKER,);
    expect(redacted.webhook.secret,).toBe(REDACTED_MARKER,);
    // Non-credential context survives so the audit log stays useful.
    expect(redacted.email.imapHost,).toBe("imap.example",);
    expect(redacted.email.imapPort,).toBe(993,);
    expect(redacted.matrix.homeserver,).toBe("https://matrix.example",);
    expect(redacted.nostr.relayUrls,).toEqual(["wss://relay1", "wss://relay2",],);
    expect(redacted.legacyToken,).toBe("kept-noncredential",);
    // The whole serialized record carries no plaintext credential — safe
    // to log by construction (this module has no logger at all).
    const serialized = JSON.stringify(redacted,);
    for (
      const leaked of [
        "pw-imap",
        "pw-smtp",
        "matrix-syt-token",
        "pw-xmpp",
        "1234:AAFF",
        "nsec1fixture",
        "hmac-secret",
        sealedToken,
      ]
    ) {
      expect(serialized.includes(leaked,),).toBe(false,);
    }
  });

  test("redacts secret: references under non-sensitive keys", () => {
    const record = { webhook: { ref: "secret:v1:aa:bb", url: "https://example", }, };
    const redacted = redactCredentials(record,);
    expect(redacted.webhook.ref,).toBe(REDACTED_MARKER,);
    expect(redacted.webhook.url,).toBe("https://example",);
  });

  test("redacts sensitive values inside arrays, nested and bare", () => {
    const record = {
      items: [{ password: "pw-item", note: "keep", }, "secret:v1:aa:bb",],
      nested: [[{ token: "tok-inner", },],],
    };

    const redacted = redactCredentials(record,);
    const first = redacted.items[0] as { password: string; note: string };
    expect(first.password,).toBe(REDACTED_MARKER,);
    expect(first.note,).toBe("keep",);
    expect(redacted.items[1],).toBe(REDACTED_MARKER,);
    expect(redacted.nested[0]![0]!.token,).toBe(REDACTED_MARKER,);
  });

  test("matches sensitive keys case-insensitively — and only those", () => {
    const redacted = redactCredentials({ BotToken: "tg", ACCESSTOKEN: "mx", IMAPPASS: "im", },);
    expect(redacted.BotToken,).toBe(REDACTED_MARKER,);
    expect(redacted.ACCESSTOKEN,).toBe(REDACTED_MARKER,);
    expect(redacted.IMAPPASS,).toBe(REDACTED_MARKER,);
    // Object.prototype-named keys must NOT match via the prototype chain.
    const kept = redactCredentials({ constructor: "schema-fn", toString: "label", host: "imap.example", },);
    expect(kept.constructor,).toBe("schema-fn",);
    expect(kept.toString,).toBe("label",);
    expect(kept.host,).toBe("imap.example",);
  });

  test("is pure — the input record is never mutated", () => {
    const record = { matrix: { accessToken: "syt_orig", }, webhook: { ref: "secret:v1:aa:bb", }, };
    redactCredentials(record,);
    expect(record.matrix.accessToken,).toBe("syt_orig",);
    expect(record.webhook.ref,).toBe("secret:v1:aa:bb",);
  });

  test("passes through scalars and class instances untouched", () => {
    expect(redactCredentials(42,),).toBe(42,);
    expect(redactCredentials(null,),).toBe(null,);
    expect(redactCredentials("secret:v1:aa:bb",),).toBe(REDACTED_MARKER,);
    expect(redactCredentials("ordinary",),).toBe("ordinary",);
    const stamp = new Date("2026-01-01T00:00:00Z",);
    expect(redactCredentials(stamp,),).toBe(stamp,);
    const withDate = redactCredentials({ at: stamp, password: "pw", },);
    expect(withDate.at,).toBe(stamp,);
    expect(withDate.password,).toBe(REDACTED_MARKER,);
  });
});
