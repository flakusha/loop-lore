// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * GPG pre-flight for the parallel check runner: verify the agent signing
 * cache is warm via a silent trial sign, warm it through the configured
 * passphrase source or terminal pinentry, or refuse to start. The resulting
 * state is exported for the report's provenance field.
 */

// oxlint-disable-next-line import/no-nodejs-modules
import { existsSync, readFileSync, } from "node:fs";
// oxlint-disable-next-line import/no-nodejs-modules
import path from "node:path";
import {
  effectiveCacheTtl,
  passphraseSource,
  probeCachedPassphrase,
  warmCacheViaPassphrase,
  warmCacheViaPinentry,
} from "../../gpg-unlock.mjs";
import { MODE, PROJECT_ROOT, } from "./config.mjs";

// ── GPG pre-flight ──────────────────────────────────────────────
// Tracks the cache state for provenance in the report. Shape:
// `cold` means we exited before any check ran — the report will reflect
// that via `exitCode: 1` from the cold-cache exit path below.
export const gpgPrecheck = { state: null, };

/**
 * Pre-flight: ensure the agent's GPG key is unlocked before any check
 * subprocess starts. The probe is a silent trial sign (cancel-mode) — it
 * can never prompt or hang. A warm cache proceeds silently; a cold one is
 * warmed via the headless passphrase source (if configured) or the
 * terminal pinentry (TTY, non-ci), and anything that still cannot warm
 * refuses to start: a check subprocess signing against a cold cache would
 * hang on a pinentry prompt no harness can answer.
 */
export async function ensureGpgWarm() {
  // Dev/sandbox escape hatch: `CHECK_SKIP_GPG_PRECHECK=1` runs the gate
  // anyway (still no-op on the GPG side). Useful for `bun run check` in
  // worktrees without `.credentials.env` and for CI environments that
  // pre-stage credentials out of band. The provenance field reflects the
  // bypass so reviewers see a `state: "skipped"` report.
  if (process.env.CHECK_SKIP_GPG_PRECHECK === "1") {
    console.log("gpg-precheck: skipped (CHECK_SKIP_GPG_PRECHECK=1)",);
    gpgPrecheck.state = { state: "skipped", };
    return;
  }
  const credentialsPath = path.resolve(PROJECT_ROOT, ".credentials.env",);
  if (!existsSync(credentialsPath,)) {
    console.error("hint: gpg-no-credentials",);
    console.error(`.credentials.env not found at ${credentialsPath}`,);
    console.error("  Copy .credentials.env.example and fill in AGENT_GPG_KEY_ID/NAME/EMAIL.",);
    gpgPrecheck.state = { state: "cold", reason: "no-credentials", };
    process.exit(1,);
  }
  const content = readFileSync(credentialsPath, "utf-8",);
  const m = /^AGENT_GPG_KEY_ID\s*=\s*["']?([^"'\n]*)["']?/m.exec(content,);
  const keyId = m?.[1]?.trim().replaceAll(/^["']|["']$/g, "",) ?? "";
  if (!keyId) {
    console.error("hint: gpg-no-key-id",);
    console.error("AGENT_GPG_KEY_ID not set in .credentials.env",);
    gpgPrecheck.state = { state: "cold", reason: "no-key-id", };
    process.exit(1,);
  }
  // Step 1: honest probe — silent trial sign (cannot prompt, cannot hang).
  if (probeCachedPassphrase(keyId,).warm) {
    console.log(
      `gpg-precheck: warm (silent sign verified, ttl ${effectiveCacheTtl()}s, key ${keyId.slice(0, 8,)}...)`,
    );
    gpgPrecheck.state = { state: "warm", ttl: effectiveCacheTtl(), };
    return;
  }

  // Step 2: cold cache. Try the headless passphrase source first, then the
  // terminal pinentry (TTY, non-ci only). Anything else refuses to start —
  // a check subprocess that signs against a cold cache would hang.
  const passphrase = passphraseSource();
  if (passphrase) {
    console.error("gpg-precheck: cold; warming via loopback passphrase source...",);
    warmCacheViaPassphrase(keyId, passphrase,);
    if (probeCachedPassphrase(keyId,).warm) {
      gpgPrecheck.state = { state: "warm", via: "passphrase", };
      return;
    }
  } else if (MODE !== "ci" && process.stdin.isTTY) {
    console.error("gpg-precheck: cold; warming via pinentry (enter passphrase)...",);
    warmCacheViaPinentry(keyId,);
    if (probeCachedPassphrase(keyId,).warm) {
      gpgPrecheck.state = { state: "warm", via: "pinentry", };
      return;
    }
  }

  console.error("hint: gpg-cold-cache",);
  console.error(`GPG agent does not have ${keyId} unlocked.`,);
  console.error(`Run: bun run scripts/gpg-unlock.mjs`,);
  gpgPrecheck.state = { state: "cold", reason: "cache-cold", };
  process.exit(1,);
}
