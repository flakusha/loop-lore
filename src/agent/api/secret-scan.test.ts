// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { scanPatchForSecrets, type SecretKind, } from "./secret-scan";

const AWS = `AKIA${"A".repeat(16,)}`;
const PAT = `ghp_${"a".repeat(36,)}`;
const FINE_PAT = `github_pat_${"a".repeat(30,)}`;
const PEM = "-----BEGIN PRIVATE KEY-----";
const ENTROPY_VALUE = "aB3dE5gH7jK9mN1pQ3rS5tU7vW9xY1zAb4Cd6Ef";

/** Build a one-file unified diff; added lines start at new-file line `start`. */
function patch(lines: readonly string[], file = "src/config.ts", start = 7,): string {
  return [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    `@@ -${start},1 +${start},${lines.length} @@`,
    ...lines.map((line,) => `+${line}`),
    "",
  ].join("\n",);
}

function kinds(lines: readonly string[],): SecretKind[] {
  return scanPatchForSecrets(patch(lines,),).map((hit,) => hit.kind);
}

describe("scanPatchForSecrets patterns", () => {
  test("AWS access key cites file and new-file line", () => {
    expect(scanPatchForSecrets(patch([`const key = "${AWS}";`,],),),).toEqual([
      { file: "src/config.ts", line: 7, kind: "aws_access_key", },
    ],);
  });

  test("both GitHub token shapes", () => {
    expect(kinds([`ghp = "${PAT}";`, `fine = "${FINE_PAT}";`,],),).toEqual([
      "github_token",
      "github_token",
    ],);
  });

  test("PEM private-key header", () => {
    expect(kinds([PEM,],),).toEqual(["private_key",],);
  });

  test("credentials file path", () => {
    expect(kinds(["open .credentials.env",],),).toEqual(["credentials_file",],);
  });

  test("high-entropy value on a secret-named assignment", () => {
    expect(kinds([`const apiKey = "${ENTROPY_VALUE}";`,],),).toEqual(["high_entropy_secret",],);
  });

  test("clean diff yields no hits", () => {
    expect(kinds(["const port = 8080;", 'const name = "service";',],),).toEqual([],);
  });

  test("deleted lines are not scanned", () => {
    const diff = [
      "diff --git a/src/config.ts b/src/config.ts",
      "--- a/src/config.ts",
      "+++ b/src/config.ts",
      "@@ -7,1 +7,1 @@",
      `-const key = "${AWS}";`,
      "+const key = process.env.KEY;",
      "",
    ].join("\n",);

    expect(scanPatchForSecrets(diff,),).toEqual([],);
  });

  test("allowlisted fixture path is skipped", () => {
    const fixture = patch([`const key = "${AWS}";`,], "src/fixtures/keys.test.ts",);
    expect(scanPatchForSecrets(fixture,),).toHaveLength(1,);
    expect(scanPatchForSecrets(fixture, { allowlist: ["src/fixtures/",], },),).toEqual([],);
  });

  test("two-line string concatenation is joined before matching", () => {
    expect(kinds([`const key = "AKIA" +`, `"${"A".repeat(16,)}";`,],),).toContain("aws_access_key",);
  });

  test("high-entropy base64 blob is flagged", () => {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const blob = Array.from({ length: 96, }, (_, i,) => alphabet.charAt((i * 37 + 11) % 64,),).join("",);
    expect(kinds([`const payload = "${blob}";`,],),).toContain("high_entropy_secret",);
  });

  test("one hit per kind and line", () => {
    expect(kinds([`const a = "${AWS}"; const b = "${AWS}";`,],),).toEqual(["aws_access_key",],);
  });
});

describe("scanPatchForSecrets performance", () => {
  test("100KB clean diff scans without pathological cost", () => {
    const body = Array.from({ length: 4000, }, (_, i,) => `+const line${i} = "value${i}";`,).join("\n",);
    const diff = `--- a/src/big.ts\n+++ b/src/big.ts\n@@ -1,1 +1,4000 @@\n${body}\n`;
    expect(diff.length,).toBeGreaterThan(100_000,);
    const started = performance.now();
    expect(scanPatchForSecrets(diff,),).toEqual([],);
    expect(performance.now() - started,).toBeLessThan(500,);
  });
});
