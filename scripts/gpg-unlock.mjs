#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * GPG passphrase unlock for loop-lore agent commits.
 *
 * Reads .credentials.env and signs test data to warm the gpg-agent cache.
 * Must be run in a REAL TERMINAL (not inside opencode) — pinentry needs a TTY.
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

// ── Unlock GPG key ───────────────────────────────────────────────

async function unlockGpg(keyId,) {
  console.log(`Unlocking GPG key: ${keyId.slice(0, 8,)}...`,);

  try {
    // Sign test data to prompt for passphrase and cache it in gpg-agent
    await $`echo "unlock" | gpg --pinentry-mode loopback --sign --local-user ${keyId} --output /dev/null`.quiet();
    console.log("Passphrase cached.",);
    console.log("You can now run agent commits. Cache expires after gpg-agent TTL.",);
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
const success = await unlockGpg(keyId,);
process.exit(success ? 0 : 1,);
