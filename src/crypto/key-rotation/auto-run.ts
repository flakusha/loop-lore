/**
 * Auto-rotation orchestrator for all expired keys.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { getSmk, isEncryptionEnabled, } from "../smk";
import { findExpiredKeys, } from "./find-expired";
import { log, } from "./log";
import { rotateActorKeyAndReEncrypt, } from "./rotate";
import type { RotationResult, RotationSummary, } from "./types";

/**
 * Run auto-rotation for all expired keys.
 * Designed to be called periodically (e.g., every hour or daily).
 *
 * @param database - Kysely DB instance
 * @param rotationDays - Days before a key is considered expired (0 = disabled)
 * @param reEncryptLimit - Max messages to re-encrypt per chat (default 100)
 * @returns Summary of rotation results
 */
export async function runAutoRotation(
  database: Kysely<DB>,
  rotationDays: number,
  reEncryptLimit = 100,
): Promise<RotationSummary> {
  const log2 = log();

  if (!isEncryptionEnabled()) {
    log2.debug("Encryption not enabled, skipping auto-rotation",);
    return { checked: 0, rotated: 0, results: [], errors: [], };
  }

  if (rotationDays <= 0) {
    log2.debug("Auto-rotation disabled (keyRotationDays = 0)",);
    return { checked: 0, rotated: 0, results: [], errors: [], };
  }

  const smk = getSmk();
  if (!smk) {
    log2.warn("SMK not loaded, cannot rotate keys",);
    return { checked: 0, rotated: 0, results: [], errors: ["SMK not loaded",], };
  }

  // Find expired keys
  const expiredActorIds = await findExpiredKeys(database, rotationDays,);

  if (expiredActorIds.length === 0) {
    log2.debug("No expired keys found",);
    return { checked: 0, rotated: 0, results: [], errors: [], };
  }

  log2.info(`Found ${expiredActorIds.length} actors with expired keys, rotating...`,);

  const results: RotationResult[] = [];
  const errors: string[] = [];

  // Rotate each actor's key
  for (const actorId of expiredActorIds) {
    try {
      const result = await rotateActorKeyAndReEncrypt(
        database,
        actorId,
        smk,
        reEncryptLimit,
      );
      results.push(result,);
    } catch (error) {
      const errMsg = `Failed to rotate key for actor ${actorId}: ${String(error,)}`;
      log2.error(errMsg,);
      errors.push(errMsg,);
    }
  }

  log2.info(`Auto-rotation complete: ${results.length} rotated, ${errors.length} errors`,);

  return {
    checked: expiredActorIds.length,
    rotated: results.length,
    results,
    errors,
  };
}
