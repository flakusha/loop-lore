#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * GPG passphrase cache manager for loop-lore agent commits.
 *
 * Reads .credentials.env and manages the gpg-agent passphrase cache:
 *   - Prolong: when called repeatedly, resets the cache TTL to the
 *     configured max-cache-ttl (no prompt, no signing).
 *   - Warm:    populates the agent cache by triggering a sign with the
 *     configured pinentry program (pinentry-tty by default). The agent
 *     serves cached passphrases silently when warm, so warmCache is
 *     effectively a no-op on warm cache — see `warmCache` for the
 *     discriminated return contract.
 *
 * Prolong requires `allow-preset-passphrase` in the user's gpg-agent
 * config. When the agent refuses `PRESET_PASSPHRASE` with `ERR 67108924
 * Not supported`, we report `preset-unsupported` so callers can skip the
 * `preset-unsupported` is distinct from `preset-rejected` so the caller can
 * skip the prolong path cleanly (treat the agent's existing cache as the
 * source of truth) instead of treating an environment gap as a transient
 * failure.
 *
 * Prolong works in any environment (no TTY required). Warm requires a TTY
 * because the configured pinentry program reads the passphrase from the
 * controlling terminal; calling warmCache from a non-TTY context will
 * fail at the pinentry layer (the script surfaces this via the `failed`
 * discriminated result).
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
  // F5: when neither HOME nor USERPROFILE is set, fall back to /tmp
  // (which is always writable) so path.join never sees "". GNUPGHOME
  // overrides both — the agent uses it as the keyring root directly,
  // no ".gnupg" suffix is appended.
  if (process.env.GNUPGHOME) {
    return path.join(process.env.GNUPGHOME, "gpg-agent.conf",);
  }
  const homeRoot = process.env.HOME ?? process.env.USERPROFILE;
  if (!homeRoot) {
    return path.join("/tmp", "gpg-agent.conf",);
  }
  return path.join(homeRoot, ".gnupg", "gpg-agent.conf",);
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
 *   { ok: false, reason: "cache-empty" }          — agent accepted PRESET_PASSPHRASE but the cache
 *                                                   entry doesn't actually contain a passphrase
 *                                                   (gpg-agent 2.4+ silently succeeds on empty entries)
 *   { ok: false, reason: "preset-rejected", ... }  — agent refused for some other reason
 *
 * `preset-unsupported` is distinct from `preset-rejected` so the caller can
 * skip the prolong path cleanly (treat the agent's existing cache as the
 * source of truth) instead of treating an environment gap as a transient
 * failure.
 */
async function prolongCachedPassphrase(keyId,) {
  const keygrips = await getKeygrip(keyId,);
  if (keygrips.length === 0) { return { ok: false, reason: "no-keygrip", }; }

  const maxTtl = readMaxCacheTtl();
  // PRESET_PASSPHRASE --preset <keygrip> -1 <hex_timestamp>
  //   --preset = update existing cache entry (not --unpreset which clears)
  //   -1       = reuse the cached passphrase bytes (don't override)
  //   <hex>    = absolute unix timestamp when cache should expire (UPPERCASE HEX)
  const newExp = (Math.floor(Date.now() / 1000) + maxTtl)
    .toString(16)
    .toUpperCase();

  let lastErr = "";
  for (const keygrip of keygrips) {
    try {
      const out = await $`gpg-connect-agent "PRESET_PASSPHRASE --preset ${keygrip} -1 ${newExp}" /bye`.text();
      if (!/^ERR/m.test(out)) {
        // PRESET_PASSPHRASE --preset refreshes the cache TTL on whatever
        // entry the agent is tracking for this keygrip. gpg-agent 2.4+
        // will set the TTL even on a phantom (empty) entry — the next
        // real sign op is what actually populates the passphrase bytes.
        //
        // We deliberately do NOT probe further here. Earlier versions
        // tried `gpg --clearsign` with --pinentry-mode loopback to detect
        // cache-empty, but that probe forced NEED_PASSPHRASE on warm
        // cache too (gpg can't validate stdin against the cached bytes),
        // making prolong lie that the cache was empty when it wasn't.
        // Trust PRESET success; if the cache is genuinely empty, the
        // user's next `git commit -S` will prompt naturally and pinentry
        // will populate it.
        return { ok: true, keygrip, maxTtl };
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
  return { ok: false, reason: "preset-rejected", output: `tried ${keygrips.length} keygrip(s): ${lastErr}`, };
}

// ── Warm (populate cache via pinentry) ────────────────────────────
//
// Strategy: trigger a real sign op so gpg-agent prompts the configured
// pinentry (pinentry-tty by default). The user types the passphrase once;
// gpg-agent caches it for `default-cache-ttl` (8h) or `max-cache-ttl`
// (2.4h, whichever is shorter) and serves it silently to subsequent
// `git commit -S` calls until the cache expires.
//
// If `GIT_GPG_PASSPHRASE` env var or `~/.gpg-passphrase` is set, we use
// `--batch --passphrase` instead of pinentry so non-TTY harnesses can
// warm the cache too. The env-file path is opt-in, never default — the
// script does NOT require a passphrase file to exist.
//
// --status-fd is the source of truth for cache state:
//   GOOD_PASSPHRASE + SIG_CREATED  → cache populated (sign succeeded)
//   NEED_PASSPHRASE                → agent rejected the passphrase
//   anything else + non-zero exit  → failure; surface stderr verbatim
async function warmCache(keyId) {
  console.log(`Unlocking GPG key: ${keyId.slice(0, 8)}...`);

  // Opt-in: read passphrase from env or file if the user has set one up.
  // No fallback default — absent means "use pinentry".
  const passphrase = process.env.GIT_GPG_PASSPHRASE
    ?? (() => { try { return readFileSync(`${process.env.HOME}/.gpg-passphrase`, "utf8").trim(); } catch { return ""; } })();

  const args = [
    "gpg",
    ...(passphrase ? ["--batch", "--yes", "--passphrase", passphrase] : []),
    "--pinentry-mode", passphrase ? "loopback" : "default",
    "--status-fd", "1",
    "--local-user", keyId,
    "--clearsign",
    "--output", "/dev/null",
  ];

  const proc = Bun.spawnSync(args, { stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  proc.stdin?.write("\n");
  proc.stdin?.end();

  const statusOut = proc.stdout.toString("utf-8");
  const stderrOut = proc.stderr.toString("utf-8");

  // SIG_CREATED is the authoritative success signal: a signature was
  // actually produced. GOOD_PASSPHRASE may be absent on warm cache (agent
  // serves passphrase silently without emitting the status line), so we
  // don't require it. NEED_PASSPHRASE means the agent explicitly asked
  // and got nothing back.
  if (/SIG_CREATED/.test(statusOut) && !/NEED_PASSPHRASE/.test(statusOut)) {
    console.log("Passphrase cached.");
    console.log(
      "Re-run this script to prolong the cache TTL (requires allow-preset-passphrase in gpg-agent.conf).",
    );
    return { kind: "populated", keyId };
  }
  // Cache empty + pinentry failed to deliver a passphrase (no /dev/tty,
  // pinentry cancelled, etc.). Surface gpg's own stderr so the user can
  // diagnose; exit non-zero so callers see the failure.
  console.error("Failed — gpg-agent did not accept a passphrase for this key.");
  if (stderrOut.trim()) { console.error(`gpg stderr: ${stderrOut.trim()}`); }
  if (statusOut.trim()) { console.error(`status stream: ${statusOut.trim().split("\n").join(" | ")}`); }
  if (!passphrase) {
    console.error("hint: passphrase entry is required (pinentry-tty or a configured passphrase source).");
  }
  return { kind: "failed", keyId, stderr: stderrOut || statusOut };
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

  // Step 2: distinguish config gap (`preset-unsupported`) from genuine
  // cold cache. The CLI mirrors check-parallel.mjs:490-493 — when the
  // agent can't be prolonged, trust the existing cache and exit cleanly.
  // Without this, every invocation falls into warmCache, which on warm
  // cache is a silent no-op that prints "Passphrase cached." — misleading
  // operators into thinking the cache was just populated.
  if (prolonged.reason === "preset-unsupported") {
    const maxTtl = readMaxCacheTtl();
    console.log(
      `Prolong unavailable (allow-preset-passphrase not set); trusting agent cache as-is (max-cache-ttl=${maxTtl}s).`,
    );
    console.log(`Hint: add 'allow-preset-passphrase' to ~/.gnupg/gpg-agent.conf to enable silent prolong.`,);
    process.exit(0,);
  }
  console.log(`Cache miss (${prolonged.reason}); warming via pinentry sign...`,);
  const warmed = await warmCache(keyId,);
  process.exit(warmed.kind === "failed" ? 1 : 0,);
}
