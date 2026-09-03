// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * GPG pre-flight helpers for worktree signing flows.
 *
 * Centralizes the cold-cache detection that was previously inlined in
 * commit.ts, agent-commit.ts, sign.ts, merge.ts, and finalize.ts. Each
 * flow used a slightly different inline check; some emitted the
 * `Run: ./scripts/gpg-unlock.mjs` hint on failure, others did not, and
 * two of them (`merge.ts` and `finalize.ts`'s direct branch via
 * `gpgMergeFlags`) silently degraded to unsigned commits when the cache
 * was cold.
 *
 * Usage:
 *   import { assertGpgUnlocked, assertAgentGpgUnlocked } from "../utils/gpg";
 *
 *   // For flows with an explicit key id (sign.ts, commit.ts, agent-commit.ts):
 *   assertGpgUnlocked(config.agentGpgKeyId);
 *
 *   // For flows that derive the key from .credentials.env (merge.ts,
 *   // finalize.ts): `assertAgentGpgUnlocked()` reads AGENT_GPG_KEY_ID
 *   // automatically.
 *   assertAgentGpgUnlocked();
 *
 * Failure modes — all exit 1, each emits a `hint: <mode>` stderr line so a
 * future programmatic consumer can branch on the hint without an exit-code
 * taxonomy today:
 *
 *   hint: invalid-key
 *     keyId is missing or not a valid hex fingerprint (8/16/40 chars).
 *
 *   hint: key-not-in-keyring
 *     `gpg --list-keys <id>` failed; key is not in the local keyring.
 *     Fix: `gpg --import <path-to-secret.asc>` or update
 *     `AGENT_GPG_KEY_ID` in `.credentials.env`.
 *
 *   hint: key-not-unlocked
 *     `gpg --list-secret-keys <id>` failed; the public key is in the
 *     keyring but gpg-agent has not cached the passphrase. Fix:
 *     `bun run scripts/gpg-unlock.mjs`.
 *
 * Design: tree/worktree-investigate-gpg-unlock-ergonomics/.tmp/gpg-unlock-ergonomics-design.md
 * Ticket: BUG-fix-worktree-assert-gpg-unlocked-on-every-signing-path-surfa
 */

import { spawnSync, } from "bun";
import { credentials, } from "./credentials.mjs";

export type GpgHint = "invalid-key" | "key-not-in-keyring" | "key-not-unlocked";

/**
 * Regex + length check for a GPG fingerprint.
 * Accepts full 40-char fingerprints, 16-char short IDs, and 8-char short
 * IDs. Must be hex.
 */
const FINGERPRINT_RE = /^[A-F0-9]+$/i;
const MIN_LEN = 8;
const MAX_LEN = 40;

function fail(hint: GpgHint, message: string,): never {
  console.error(`hint: ${hint}`,);
  console.error(message,);
  process.exit(1,);
}

function gpgAvailable(): boolean {
  const probe = spawnSync(["gpg", "--version",], {
    stdout: "ignore",
    stderr: "ignore",
    cwd: undefined,
  },);
  return probe.success;
}

/**
 * Verify the secret key for `keyId` is reachable via gpg-agent.
 *
 * Two checks run in order:
 *   (a) `gpg --list-keys <id>` — is the public key in the local keyring?
 *       If not, this is a config error (wrong id, missing import).
 *   (b) `gpg --list-secret-keys <id>` — can gpg-agent see the secret?
 *       If not, this is an operational error (passphrase not cached).
 *
 * Both checks exit 1 on failure with a distinct `hint:` prefix so the
 * failure mode is unambiguous to the operator.
 */
export function assertGpgUnlocked(keyId: string | undefined | null,): void {
  if (!keyId || !FINGERPRINT_RE.test(keyId,) || keyId.length < MIN_LEN || keyId.length > MAX_LEN) {
    fail(
      "invalid-key",
      `Invalid AGENT_GPG_KEY_ID '${keyId ?? ""}'. Expected a 40-char (or 16/8-short) hex fingerprint.`,
    );
  }

  if (!gpgAvailable()) {
    fail(
      "key-not-in-keyring",
      "gpg binary not found on PATH. Install gnupg or fix the PATH.",
    );
  }

  const publicCheck = spawnSync(["gpg", "--list-keys", keyId,], {
    stdout: "ignore",
    stderr: "ignore",
    cwd: undefined,
  },);
  if (!publicCheck.success) {
    fail(
      "key-not-in-keyring",
      `GPG key ${keyId} is not in the keyring.\n` +
        `   Add it via: gpg --import <path-to-secret.asc>\n` +
        `   or update AGENT_GPG_KEY_ID in .credentials.env`,
    );
  }

  const secretCheck = spawnSync(["gpg", "--list-secret-keys", keyId,], {
    stdout: "ignore",
    stderr: "ignore",
    cwd: undefined,
  },);
  if (!secretCheck.success) {
    fail(
      "key-not-unlocked",
      `GPG agent does not have ${keyId} unlocked. Run: bun run scripts/gpg-unlock.mjs`,
    );
  }
}

/**
 * Read `AGENT_GPG_KEY_ID` from the shared credentials loader and delegate
 * to `assertGpgUnlocked`. Use this when the caller does not have its own
 * `WorktreeConfig.agentGpgKeyId` — typically `merge.ts` and `finalize.ts`,
 * which derive the signing identity from `.credentials.env`.
 */
export function assertAgentGpgUnlocked(): void {
  if (!credentials.found) {
    fail(
      "key-not-in-keyring",
      "No agent GPG credentials loaded. Populate .credentials.env with AGENT_GPG_KEY_ID/NAME/EMAIL.",
    );
  }
  assertGpgUnlocked(credentials.keyId,);
}
