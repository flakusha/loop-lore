// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// `--instance <name>` CLI flag. Explicit flag wins over LOOP_LORE_INSTANCE
// env (explicit > env, matching the env-over-config rule); absent flag leaves
// the env chain untouched (today's behavior, unchanged paths).
//
// Import-time ordering matters: entrypoints import this module FIRST so the
// flag lands in process.env before any config module freezes DATA_DIR at
// import. Importing it is a no-op unless `--instance` is present in argv.

import { INSTANCE_ENV_VAR, sanitizeInstanceSlug, } from "./state-dir";

/** CLI flag selecting the state instance dir ($STATE_ROOT/<name>/). */
export const INSTANCE_FLAG = "--instance";

/**
 * Fail-loud check: the flag value must already be a clean slug — no silent
 * remap (no trim, no case fold, no separator rewrite).
 * @param raw - raw flag value
 * @returns raw unchanged when valid
 * @throws Error on empty, flag-like (`-x`), or non-slug values
 */
function checkInstanceFlag(raw: string,): string {
  if (raw.trim() === "" || raw.startsWith("-",) || sanitizeInstanceSlug(raw,) !== raw) {
    throw new Error(
      `invalid ${INSTANCE_FLAG} ${JSON.stringify(raw,)}: use [A-Za-z0-9._-] (no path separators)`,
    );
  }
  return raw;
}

/**
 * Peek-scan argv for `--instance <name>` / `--instance=<name>`; argv is left
 * intact for the real argument parser.
 * @param argv - args to scan (defaults to the process args)
 * @returns the validated name, or undefined when the flag is absent
 * @throws Error on missing/invalid values
 */
export function parseInstanceFlag(argv: readonly string[] = process.argv.slice(2,),): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === INSTANCE_FLAG) {
      const value = argv[i + 1];
      if (value === undefined) {
        throw new Error(`invalid ${INSTANCE_FLAG}: flag requires a value`,);
      }
      return checkInstanceFlag(value,);
    }
    if (arg?.startsWith(`${INSTANCE_FLAG}=`,)) {
      return checkInstanceFlag(arg.slice(INSTANCE_FLAG.length + 1,),);
    }
  }
  return undefined;
}

/**
 * Apply the flag: set LOOP_LORE_INSTANCE when present (flag wins over env),
 * no-op otherwise.
 */
export function applyInstanceFlag(argv: readonly string[] = process.argv.slice(2,),): void {
  const value = parseInstanceFlag(argv,);
  if (value !== undefined) {
    process.env[INSTANCE_ENV_VAR] = value;
  }
}

applyInstanceFlag();
