// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Pure scanner for credential material in added diff lines. No I/O, no deps.
 * Consumed by the future agent commit gate (#8); standalone today.
 * @module agent/api/secret-scan
 */

/** Credential shapes recognised by {@link scanPatchForSecrets}. */
export type SecretKind =
  | "aws_access_key"
  | "github_token"
  | "private_key"
  | "credentials_file"
  | "high_entropy_secret";

/** One finding; file is the added path, line is the new-file line number. */
export interface SecretHit {
  file: string;
  line: number;
  kind: SecretKind;
}

/** Options for {@link scanPatchForSecrets}. */
export interface ScanPatchOptions {
  /** Added paths containing any of these substrings are skipped (fixtures). */
  allowlist?: readonly string[];
}

const AWS_KEY = /\bAKIA[0-9A-Z]{16}\b/;
const GITHUB_TOKEN = /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/;
const PRIVATE_KEY = /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----/;
const CREDENTIALS_PATH = /\.credentials\.env\b/;
const SECRET_ASSIGN =
  /\b(?:api[_-]?key|secret|token|password|passwd|credential|private[_-]?key)\w*\s*[:=]\s*["'`]?([A-Za-z0-9+/=_-]{32,})/gi;

const BASE64_BLOB = /\b[A-Za-z0-9+/]{80,}={0,2}\b/g;
const HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
const ADDED_FILE = /^\+\+\+ b\/(.+)$/;
/** String-concatenation noise removed before the two-line window check. */
const CONCAT_NOISE = /["'`+\\\s]/g;

/** Shannon entropy in bits/char; base64 secrets sit above 4.5. */
function entropy(value: string,): number {
  const counts = new Map<string, number>();
  for (const char of value) { counts.set(char, (counts.get(char,) ?? 0) + 1,); }
  let bits = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    bits -= p * Math.log2(p,);
  }

  return bits;
}

/** Patterns that cannot be assembled across two adjacent added lines. */
function matchLine(text: string, file: string, line: number, hits: SecretHit[],): void {
  const push = (kind: SecretKind,): void => {
    hits.push({ file, line, kind, },);
  };

  if (AWS_KEY.test(text,)) { push("aws_access_key",); }
  if (GITHUB_TOKEN.test(text,)) { push("github_token",); }
  if (PRIVATE_KEY.test(text,)) { push("private_key",); }
  if (CREDENTIALS_PATH.test(text,)) { push("credentials_file",); }
  for (const match of text.matchAll(SECRET_ASSIGN,)) {
    if (entropy(match[1] ?? "",) >= 4.0) {
      push("high_entropy_secret",);
      break;
    }
  }

  for (const match of text.matchAll(BASE64_BLOB,)) {
    if (entropy(match[0],) >= 5.0) {
      push("high_entropy_secret",);
      break;
    }
  }
}

/**
 * Scan a unified diff, returning file+line hits for added lines only.
 * @param diff - Verbatim unified diff text.
 * @param options - Optional path allowlist.
 * @returns One hit per distinct (file, line, kind); empty when clean.
 */
export function scanPatchForSecrets(diff: string, options: ScanPatchOptions = {},): SecretHit[] {
  const allowlist = options.allowlist ?? [];
  const hits: SecretHit[] = [];
  const seen = new Set<string>();
  let file = "(unknown)";
  let line = 0;
  let previousAdded = "";

  const record = (kind: SecretKind, atLine: number,): void => {
    const key = `${file}:${atLine}:${kind}`;
    if (!seen.has(key,)) {
      seen.add(key,);
      hits.push({ file, line: atLine, kind, },);
    }
  };

  for (const raw of diff.split("\n",)) {
    const addedFile = ADDED_FILE.exec(raw,);
    if (addedFile) {
      file = addedFile[1] ?? "(unknown)";
      previousAdded = "";
      continue;
    }

    const hunk = HUNK.exec(raw,);
    if (hunk) {
      line = Number(hunk[1],);
      previousAdded = "";
      continue;
    }

    if (raw.startsWith("---",) || raw.startsWith("diff ",) || raw.startsWith("index ",)) { continue; }
    if (raw.startsWith("+",)) {
      const text = raw.slice(1,);
      const local: SecretHit[] = [];
      matchLine(text, file, line, local,);
      if (previousAdded !== "" && !allowlist.some((part,) => file.includes(part,))) {
        const joined = previousAdded.replace(CONCAT_NOISE, "",) + text.replace(CONCAT_NOISE, "",);
        const windowHits: SecretHit[] = [];
        matchLine(joined, file, line, windowHits,);
        for (const hit of windowHits) {
          if (hit.kind === "aws_access_key" || hit.kind === "github_token") { local.push(hit,); }
        }
      }

      if (!allowlist.some((part,) => file.includes(part,))) {
        for (const hit of local) { record(hit.kind, hit.line,); }
      }

      previousAdded = text;
      line += 1;
      continue;
    }

    if (raw.startsWith("-",)) { continue; }
    previousAdded = "";
    line += 1;
  }

  return hits;
}
