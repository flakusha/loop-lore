// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Stored sd.cpp setup pick — the shared fallback used by consumers whose
 * primary pick is a config-file provider only (image-edit sd-server,
 * emotion-avatar generation). This is the SAME source-of-truth materialization
 * the generation failover path uses (`listStoredSdCppProviders`) plus the
 * SAME probe gate the failover walk applies (`sdCppSkipAttempt`), so a stored
 * setup that is unreachable is skipped with a structured reason instead of
 * being handed to a consumer as a doomed candidate.
 *
 * @module sdcpp-pick
 */
import type { Kysely, } from "kysely";
import type { ImageProviderConfig, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { sdCppSkipAttempt, } from "./index";
import { listStoredSdCppProviders, } from "./sdcpp-setup";

/**
 * Pick the first healthy stored sd.cpp setup serving `purpose`.
 *
 * Candidates are the stored setups (config order) whose purpose fits; each
 * passes the failover discovery gate before it is returned. Unreachable
 * candidates are logged with the structured skip reason — never key material —
 * and the walk continues.
 * @param db - Kysely database handle
 * @param purpose - What the consumer will use the provider for
 * @returns the first probe-healthy stored provider, or null when none is
 * reachable (or nothing is stored)
 */
export async function pickStoredSdCppProvider(
  db: Kysely<DB>,
  purpose: "generate" | "edit",
): Promise<ImageProviderConfig | null> {
  const candidates = (await listStoredSdCppProviders(db,)).filter(
    (provider,) => provider.purpose === purpose || provider.purpose === "both",
  );

  const log = getLogger();
  for (const candidate of candidates) {
    const skip = await sdCppSkipAttempt(candidate, undefined,);
    if (skip) {
      log.warn({
        message: "Stored sd.cpp setup skipped — discovery probe failed",
        provider: candidate.name,
        reason: skip.reason,
      },);

      continue;
    }

    return candidate;
  }

  return null;
}
