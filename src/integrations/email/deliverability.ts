// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/integrations/email/deliverability.ts — outbound deliverability policy
// for the email channel (TASK-email-deliverability-spf-dkim-dmarc-and-inbound-
// spam-gate).
//
// Ground-up policy code — no nodemailer dependency on this path. The only
// programmatic piece is the DKIM signing hook (RFC 6376): when the operator
// sends from their own domain, the SMTP wiring signs the message here before
// hand-off (SPF/DMARC are DNS-side records — guidance lives in
// docs/spec/federation-email-channel.md §7). The private key arrives as a
// plaintext PEM resolved through the credential envelope
// (src/integrations/secrets.ts) at the wiring point; this module never
// stores, logs, or derives it.
//
// Canonicalization is relaxed/relaxed, the interoperable default; signature
// algorithm is rsa-sha256. `signDkim` never throws — failures return a typed
// Result (bridge Result convention).

import { createHash, createSign, } from "node:crypto";

/** Algorithm tag carried in every produced signature header. */
export const DKIM_ALGORITHM = "rsa-sha256";

/** Canonicalization tag carried in every produced signature header. */
export const DKIM_CANONICALIZATION = "relaxed/relaxed";

/** Request for {@link signDkim} — the raw pieces of an outbound message. */
export interface DkimSignRequest {
  /** PEM-encoded RSA private key (resolved from the credential envelope). */
  privateKeyPem: string;
  /** Signing domain — the `d=` tag (operator's own domain). */
  domain: string;
  /** DNS selector — the `s=` tag (`<selector>._domainkey.<domain>` TXT). */
  selector: string;
  /** Header names to sign, in `h=` order (RFC 6376 §5.4 recommendation:
   * From, then the rest actually present on the message). Matched
   * case-insensitively and emitted lowercase in `h=`. */
  signHeaders: readonly string[];
  /** Raw header lines already on the message, `Name: value` (each on one
   * logical line — fold continuation lines before calling). */
  headers: readonly string[];
  /** Raw body (LF or CRLF line endings accepted). */
  body: string;
  /** Signing time override, seconds since epoch; default now. */
  timestamp?: number;
}

/** Failure of {@link signDkim}. */
export type DkimSignError = { ok: false; code: "invalid_key"; message: string };

/** Result of {@link signDkim}: the header to prepend to the message. */
export type DkimSignResult =
  | { ok: true; headerName: "DKIM-Signature"; headerValue: string }
  | DkimSignError;

/** Collapse WSP runs (SP/HTAB, including unfold leftovers) to single spaces —
 * shared by the relaxed header and body canonicalizations (RFC 6376 §3.4).
 * @param value Raw text fragment.
 * @returns The fragment with WSP runs collapsed to single spaces.
 */
function collapseWsp(value: string,): string {
  return value.replaceAll(/\r?\n[\t ]+/g, " ",).replaceAll(/[\t ]+/g, " ",);
}

/** Relaxed header canonicalization of one `Name: value` line (RFC 6376
 * §3.4.2): lowercase name, WSP runs collapsed to single SP, trimmed.
 * @param line Raw logical header line.
 * @returns The canonicalized `name:value` string.
 */
export function relaxHeaderLine(line: string,): string {
  const colon = line.indexOf(":",);
  const name = (colon === -1 ? line : line.slice(0, colon,)).trim().toLowerCase();
  const value = colon === -1 ? "" : line.slice(colon + 1,);
  return `${name}:${collapseWsp(value,).trim()}`;
}

/** Relaxed body canonicalization (RFC 6376 §3.4.3): CRLF endings, stripped
 * trailing WSP per line, collapsed WSP runs, trailing empty lines removed,
 * exactly one trailing CRLF — empty body stays empty.
 * @param body Raw body text.
 * @returns The canonicalized body.
 */
export function relaxBody(body: string,): string {
  const lines = body.replaceAll("\r\n", "\n",).split("\n",);
  while (lines.length > 0 && lines[lines.length - 1] === "") { lines.pop(); }
  if (lines.length === 0) { return ""; }
  return `${lines.map((line,) => collapseWsp(line,).trimEnd()).join("\r\n",)}\r\n`;
}

/**
 * Sign an outbound message with DKIM (RFC 6376, relaxed/relaxed rsa-sha256).
 * The returned header must be PREPENDED to the message headers exactly as-is.
 * @throws never — key failures return a typed {@link DkimSignError}.
 * @param request Message pieces + signing identity + private key.
 * @returns The DKIM-Signature header, or a typed failure.
 */
export function signDkim(request: DkimSignRequest,): DkimSignResult {
  const timestamp = request.timestamp ?? Math.floor(Date.now() / 1000,);
  const bodyHash = createHash("sha256",).update(relaxBody(request.body,),).digest("base64",);

  // Signed headers are taken last-occurrence-first (RFC 6376 §5.4.2);
  // a listed header absent from the message signs as empty (`name:`).
  // h= names are matched and emitted lowercased so title-case callers
  // ("From") resolve against the lowercased header index.
  const signHeaders = request.signHeaders.map((name,) => name.toLowerCase());
  const byName = request.headers.map((line,) => {
    const canonical = relaxHeaderLine(line,);
    return { name: canonical.slice(0, canonical.indexOf(":",),), canonical, };
  },);

  const signedLines = signHeaders.map((name,) => {
    const match = byName.findLast((part,) => part.name === name);
    return match === undefined ? `${name}:` : match.canonical;
  },);

  const unsignedHeader = `v=1; a=${DKIM_ALGORITHM}; c=${DKIM_CANONICALIZATION}; d=${request.domain};` +
    ` s=${request.selector}; t=${timestamp}; h=${signHeaders.join(":",)};` +
    ` bh=${bodyHash}; b=`;

  const data = `${signedLines.join("\r\n",)}\r\n${relaxHeaderLine(`DKIM-Signature: ${unsignedHeader}`,)}`;

  let signature: string;
  try {
    signature = createSign("RSA-SHA256",).update(data,).sign(request.privateKeyPem, "base64",);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : "unknown key error";
    return { ok: false, code: "invalid_key", message: `DKIM signing failed: ${detail}`, };
  }

  return {
    ok: true,
    headerName: "DKIM-Signature",
    headerValue: `${unsignedHeader}${signature}`,
  };
}
