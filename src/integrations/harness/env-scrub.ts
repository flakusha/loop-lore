// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * env-scrub.ts — keep loop-lore's own secrets out of external harness
 * children, and refuse reads of the on-disk files that hold them.
 *
 * Both the JSON-RPC spawn and the `--version` probe inherited the full
 * process environment, handing LLM keys and HMAC/encryption secrets to every
 * external binary a profile runs. Third-party env keys (provider keys, proxy
 * settings, CA bundles, …) belong to the child and are kept.
 */

import { basename, } from "node:path";

/**
 * loop-lore's own secret ENV names, enumerated from the authoritative list in
 * `packages/core/src/config/schema-class/env-map.ts` (manual overrides plus the
 * two documented auth spellings/aliases) and `configs/env.example.yaml` (the
 * entries marked SECRET).
 *
 * // ponytail: an explicit name list, not a suffix convention — no regex, so
 * third-party keys such as ANTHROPIC_API_KEY survive. Ceiling: a NEW loop-lore
 * secret added to env-map.ts must be added here too; dynamically-named
 * provider keys are not statically enumerable and are out of scope.
 */
const SECRET_ENV_NAMES: Record<string, true> = {
  ASSETS_SIGNED_URL_SECRET: true,
  AUTH_JWT_SECRET: true,
  AUTH_CSRF_SECRET: true,
  AUTH_JWTSECRET: true,
  AUTH_CSRFSECRET: true,
  AUTH_ADMIN_PASSWORD: true,
  BYO_KEY_ENCRYPTION_KEY: true,
  SERVER_ENCRYPTION_KEY: true,
  MESH_PSK: true,
  NSFW_PII_SECRET: true,
  NSFW_FLAG_REPORTER_HASH_SECRET: true,
  NSFW_MODERATION_HMAC_SECRET: true,
  TELEMETRY_PII_SECRET: true,
  EMAIL_IMAP_PASS: true,
  EMAIL_SMTP_PASS: true,
  MATRIX_ACCESS_TOKEN: true,
  XMPP_PASSWORD: true,
  TELEGRAM_BOT_TOKEN: true,
  DISCORD_BOT_TOKEN: true,
  TENOR_API_KEY: true,
  IRC_PASSWORD: true,
};

/**
 * Copy `env`, dropping only loop-lore's known secret names. Unknown and
 * third-party keys pass through unchanged; the input is never mutated.
 * @param env - env to scrub (defaults to the process environment)
 * @returns a fresh env object safe to hand to a child process.
 */
export function scrubEnv(env: NodeJS.ProcessEnv = process.env,): NodeJS.ProcessEnv {
  const safe: NodeJS.ProcessEnv = { ...env, };
  for (const name of Object.keys(SECRET_ENV_NAMES,)) { delete safe[name]; }
  return safe;
}

/** Exact basenames that always hold secrets. */
const DENIED_BASENAMES: Record<string, true> = {
  "env.yaml": true,
  "env.toml": true,
  ".credentials.env": true,
};

/** Basename prefixes whose files hold secrets (dot-envs, local overrides). */
const DENIED_PREFIXES = [".env", "config.local.",];
/** Basename suffixes whose files hold keys/certs. */
const DENIED_SUFFIXES = [".pem", ".key", ".p12",];

/**
 * Whether `path`'s basename names a file loop-lore uses to store secrets.
 * Case-insensitive and separator-agnostic (a Windows-style path is judged by
 * its final component).
 * @param path - path or bare filename to judge
 * @returns true when the basename is on the secret-file deny list.
 */
export function isSecretBasename(path: string,): boolean {
  const base = basename(path.replaceAll("\\", "/",),).toLowerCase();
  return Object.hasOwn(DENIED_BASENAMES, base,) ||
    DENIED_PREFIXES.some((prefix,) => base.startsWith(prefix,)) ||
    DENIED_SUFFIXES.some((suffix,) => base.endsWith(suffix,));
}
