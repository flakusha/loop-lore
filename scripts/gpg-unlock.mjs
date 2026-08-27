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
  const home = process.env.GNUPGHOME
    ?? path.join(process.env.HOME ?? process.env.USERPROFILE ?? "", ".gnupg",);
  return path.join(home, "gpg-agent.conf",);
}

function readMaxCacheTtl() {
  const confPath = agentConfigPath();
  if (!existsSync(confPath,)) return 7200; // gpg-agent default 2h
  const content = readFileSync(confPath, "utf-8",);
  const match = content.match(/^max-cache-ttl\s+(\d+)/m,);
  return match ? parseInt(match[1], 10,) : 7200;
}

async function getKeygrip(keyId,) {
  // gpg-connect-agent reply shape:
  //   S KEYINFO <keygrip> ... OK     ← key found
  //   ERR <code> <reason>             ← key not in agent
  const out = await $`gpg-connect-agent "KEYINFO --no-list ${keyId} SENT" /bye 2>&1`.text();
  return out.match(/^S KEYINFO\s+(\w+)/m,)?.[1]
    ?? out.match(/^OK KEYINFO\s+(\w+)/m,)?.[1]
    ?? null;
}



// ── Prolong cached passphrase TTL ────────────────────────────────

async function prolongCachedPassphrase(keyId,) {
  const keygrip = await getKeygrip(keyId,);
  if (!keygrip) return { ok: false, reason: "no-keygrip", };

  const maxTtl = readMaxCacheTtl();
  // PRESET_PASSPHRASE --preset <keygrip> -1 <hex_timestamp>
  //   --preset = update existing cache entry (not --unpreset which clears)
  //   -1       = reuse the cached passphrase bytes (don't override)
  //   <hex>    = absolute unix timestamp when cache should expire
  const newExp = (Math.floor(Date.now() / 1000) + maxTtl)
    .toUpperCase();

  try {
    const out = await $`gpg-connect-agent "PRESET_PASSPHRASE --preset ${keygrip} -1 ${newExp}" /bye`.text();
    if (/^ERR/m.test(out,)) {
      return { ok: false, reason: "preset-rejected", output: out.trim(), };
    }
    return { ok: true, keygrip, maxTtl, };
  } catch (e) {
    return { ok: false, reason: "preset-threw", error: String(e,), };
  }
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

// ── Main ─────────────────────────────────────────────────────────

const keyId = loadCredentials();
console.log(`GPG key: ${keyId.slice(0, 8,)}...`,);

// Step 1: try to prolong an already-cached passphrase (no prompt).
const prolonged = await prolongCachedPassphrase(keyId,);
if (prolonged.ok) {
  console.log(`Cache TTL refreshed to ${prolonged.maxTtl}s.`,);
  process.exit(0,);
}

// Step 2: cache miss — fall back to the warm flow.
console.log(`Cache miss (${prolonged.reason}); warming via loopback sign...`,);
const warmed = await warmCache(keyId,);
process.exit(warmed ? 0 : 1,);