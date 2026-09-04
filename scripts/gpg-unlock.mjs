#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * GPG passphrase cache manager for loop-lore agent commits.
 *
 * Reads .credentials.env and manages the gpg-agent passphrase cache:
 *   - Prolong: when called repeatedly, resets the cache TTL to the
 *     configured max-cache-ttl (no prompt, no signing).
 *   - Warm:    when the cache is empty, signs test data with loopback
 *     pinentry to populate it.
 *
 * Prolong requires `allow-preset-passphrase` in the user's gpg-agent
 * config. When the agent refuses `PRESET_PASSPHRASE` with `ERR 67108924
 * Not supported`, we report `preset-unsupported` so callers can skip the
 * prolong path and fall through to warmCache without spamming the user.
 *
 * Prolong works in any environment (no TTY required). Warm needs the
 * GPG passphrase supplied via stdin in loopback mode — the convention
 * for agent commits in this repo.
 *
 * Usage:
 *   bun run scripts/gpg-unlock.mjs
 */

import { $, } from "bun";
import { existsSync, readFileSync, } from "node:fs";
import path from "node:path";

const REPO_ROOT = import.meta.dir + "/..";
const CREDENTIALS_PATH = path.join(REPO_ROOT, ".credentials.env",);

// ── Load credentials ─────────────────────────────────────────────

function loadCredentials() {
  if (!existsSync(CREDENTIALS_PATH,)) {
    console.error(`Error: .credentials.env not found at ${CREDENTIALS_PATH}`,);
    console.error("Copy .credentials.env.example and fill in your values.",);
    process.exit(1,);
  }

  const content = readFileSync(CREDENTIALS_PATH, "utf-8",);
  const keyIdMatch = content.match(/^AGENT_GPG_KEY_ID=(.+)$/m,);
  // Strip surrounding quotes if present
  const keyId = keyIdMatch?.[1]?.trim().replaceAll(/^["']|["']$/g, "",);

  if (!keyId) {
    console.error("Error: AGENT_GPG_KEY_ID not set in .credentials.env",);
    process.exit(1,);
  }

  return keyId;
}

// ── GPG agent helpers ────────────────────────────────────────────

function agentConfigPath() {
  const home = process.env.GNUPGHOME ??
    path.join(process.env.HOME ?? process.env.USERPROFILE ?? "", ".gnupg",);
  return path.join(home, "gpg-agent.conf",);
}

function readMaxCacheTtl() {
  const confPath = agentConfigPath();
  if (!existsSync(confPath,)) { return 7200; // gpg-agent default 2h
   }
  const content = readFileSync(confPath, "utf-8",);
  const match = content.match(/^max-cache-ttl\s+(\d+)/m,);
  return match ? parseInt(match[1], 10,) : 7200;
}

/**
 * Resolve the signing key's keygrip(s) from the keyring (NOT the agent).
 *
 * The previous implementation used `gpg-connect-agent KEYINFO`, which queries
 * the agent's working set and returns `ERR 67108924 No secret key` whenever
 * the key hasn't been touched in the current agent session — even when the
 * passphrase is perfectly cached. That made `prolongCachedPassphrase` report
 * "no-keygrip" on every invocation, so `ensureGpgWarm()` in check-parallel
 * could never take the silent prolong path and always fell through to
 * `warmCache()` (which still works but re-prompts / re-signs every run).
 *
 * `gpg --list-secret-keys --with-keygrip` reads from the keyring directly
 * and always returns the keygrip(s), so prolong works the moment the cache
 * is populated. Returns ALL keygrips (primary + subkeys) — only the ones
 * actually in the agent cache will accept the PRESET_PASSPHRASE below.
 */
async function getKeygrip(keyId,) {
  const out = await $`gpg --list-secret-keys --with-keygrip ${keyId} 2>&1`.text();
  // Lines like: `      Keygrip = 13826444A29AFA408618EDAA5F6C54EEA604B51F`
  // (indented under each `sec`/`ssb` record — `^\s*` allows the indent).
  const matches = [...out.matchAll(/^\s*Keygrip\s+=\s+([0-9A-Fa-f]+)/gm,),];
  return matches.map((m,) => m[1]);
}

// ── Prolong cached passphrase TTL ────────────────────────────────

/**
 * Try to prolong every keygrip the keyring lists. Returns the first success,
 * or one of these structured failures:
 *   { ok: false, reason: "no-keygrip" }            — keyring lookup empty
 *   { ok: false, reason: "preset-unsupported" }   — agent lacks allow-preset-passphrase
 *   { ok: false, reason: "preset-rejected", ... }  — agent refused for some other reason
 *
 * `preset-unsupported` is distinct from `preset-rejected` so the caller can
 * skip the prolong path cleanly (warmCache still works) instead of treating
 * an environment gap as a transient failure.
 */
async function prolongCachedPassphrase(keyId,) {
  const keygrips = await getKeygrip(keyId,);
  if (keygrips.length === 0) { return { ok: false, reason: "no-keygrip", }; }

  const maxTtl = readMaxCacheTtl();
  // PRESET_PASSPHRASE --preset <keygrip> -1 <hex_timestamp>
  //   --preset = update existing cache entry (not --unpreset which clears)
  //   -1       = reuse the cached passphrase bytes (don't override)
  //   <hex>    = absolute unix timestamp when cache should expire (UPPERCASE HEX)
  // Convert seconds-since-epoch to an uppercase hex string — gpg-connect-agent
  // expects hex, and `.toUpperCase()` alone on a Number would crash. The
  // earlier code had the same shape but never ran because `getKeygrip` always
  // returned null under the old `KEYINFO` agent-query path.
  const newExp = (Math.floor(Date.now() / 1000,) + maxTtl)
    .toString(16,)
    .toUpperCase();

  let sawUnsupported = false;
  let lastErr = "";
  for (const keygrip of keygrips) {
    try {
      const out = await $`gpg-connect-agent "PRESET_PASSPHRASE --preset ${keygrip} -1 ${newExp}" /bye`.text();
      if (!/^ERR/m.test(out,)) {
        return { ok: true, keygrip, maxTtl, };
      }
      lastErr = out.trim();
      // ERR 67108924 ... no --allow-preset-passphrase → agent config lacks
      // the option. All keygrips will fail identically, so bail out now.
      if (/no --allow-preset-passphrase/.test(lastErr,)) {
        return { ok: false, reason: "preset-unsupported", output: lastErr, };
      }
    } catch (e) {
      lastErr = String(e,);
      continue;
    }
  }
  if (sawUnsupported) { return { ok: false, reason: "preset-unsupported", output: lastErr, }; }
  return { ok: false, reason: "preset-rejected", output: `tried ${keygrips.length} keygrip(s): ${lastErr}`, };
}

// ── Warm (populate cache via loopback sign) ──────────────────────

async function warmCache(keyId,) {
  console.log(`Unlocking GPG key: ${keyId.slice(0, 8,)}...`,);

  try {
    // Sign test data — pinentry-mode loopback reads passphrase from stdin
    // and writes it into gpg-agent's cache for subsequent operations.
    await $`echo "unlock" | gpg --pinentry-mode loopback --sign --local-user ${keyId} --output /dev/null`.quiet();
    console.log("Passphrase cached.",);
    console.log("Re-run this script to prolong the cache TTL.",);
    return true;
  } catch {
    console.error("Failed — enter passphrase in the pinentry dialog above.",);
    console.error("If pinentry doesn't appear, check:",);
    console.error("  gpg-connect-agent 'GETINFO pinentry_program' /bye",);
    return false;
  }
}

// Named exports so other scripts (notably scripts/check-parallel.mjs
// ensureGpgWarm()) can drive the same prolong/warm flow without spawning
// a fresh bun subprocess. The CLI entrypoint below still runs when this
// file is invoked directly.
export { getKeygrip, prolongCachedPassphrase, warmCache, };

// ── Main ─────────────────────────────────────────────────────────

if (import.meta.main) {
  const keyId = loadCredentials();
  console.log(`GPG key: ${keyId.slice(0, 8,)}...`,);

  // Step 1: try to prolong an already-cached passphrase (no prompt).
  const prolonged = await prolongCachedPassphrase(keyId,);
  if (prolonged.ok) {
    console.log(`Cache TTL refreshed to ${prolonged.maxTtl}s.`,);
    process.exit(0,);
  }

  // Step 2: cache miss (or prolong unsupported) — fall back to warm flow.
  // `preset-unsupported` is a config gap, not a real failure, so the user
  // shouldn't be scolded about it.
  if (prolonged.reason === "preset-unsupported") {
    console.log("Prolong unsupported by agent (allow-preset-passphrase not set); warming cache instead.",);
  } else {
    console.log(`Cache miss (${prolonged.reason}); warming via loopback sign...`,);
  }
  const warmed = await warmCache(keyId,);
  process.exit(warmed ? 0 : 1,);
}
