// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// `--feature <profile>` CLI flag. Explicit flag wins over FEATURES_PROFILE
// env; absent flag leaves the env chain untouched.
//
// Import-time ordering matters: entrypoints import this module FIRST so the
// flag lands in process.env before any config module reads it. Importing it is
// a no-op unless `--feature` is present in argv.

import { FEATURE_PROFILES, type FeatureProfile, } from "./schema/features";

/** CLI flag selecting the capability profile. */
export const FEATURE_FLAG = "--feature";

const PROFILE_ENV_VAR = "FEATURES_PROFILE";

/**
 * Fail-loud check: the flag value must be one of FEATURE_PROFILES — no silent
 * fallback to "full" (a typo must not quietly widen or narrow the surface).
 * @param raw - raw flag value
 * @returns the validated profile
 * @throws Error on empty, flag-like, or unknown values
 */
function checkFeatureFlag(raw: string,): FeatureProfile {
  if (raw.trim() === "" || raw.startsWith("-",) || !(FEATURE_PROFILES as readonly string[]).includes(raw,)) {
    throw new Error(
      `invalid ${FEATURE_FLAG} ${JSON.stringify(raw,)}: expected one of ${FEATURE_PROFILES.join(", ",)}`,
    );
  }
  return raw as FeatureProfile;
}

/**
 * Peek-scan argv for `--feature <profile>` / `--feature=<profile>`; argv is
 * left intact for the real argument parser. Last occurrence wins.
 * @param argv - args to scan (defaults to the process args)
 * @returns the validated profile, or undefined when the flag is absent
 * @throws Error on missing/invalid values
 */
export function parseFeatureFlag(argv: readonly string[] = process.argv.slice(2,),): FeatureProfile | undefined {
  let found: FeatureProfile | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === FEATURE_FLAG) {
      const value = argv[i + 1];
      if (value === undefined) {
        throw new Error(`invalid ${FEATURE_FLAG}: flag requires a value`,);
      }
      found = checkFeatureFlag(value,);
    } else if (arg?.startsWith(`${FEATURE_FLAG}=`,)) {
      found = checkFeatureFlag(arg.slice(FEATURE_FLAG.length + 1,),);
    }
  }
  return found;
}

/**
 * Apply the flag: set FEATURES_PROFILE when present, no-op otherwise.
 */
export function applyFeatureFlag(argv: readonly string[] = process.argv.slice(2,),): void {
  const value = parseFeatureFlag(argv,);
  if (value !== undefined) {
    process.env[PROFILE_ENV_VAR] = value;
  }
}

applyFeatureFlag();
