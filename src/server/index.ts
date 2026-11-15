// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { FirstBootContentionError, } from "../config/load";
import { portConflictMessage, } from "./port-conflict";
import { start, } from "./start";
export { createRequestHandler, handleApiRequest, } from "./handler";
export type { HandleApiRequestOpts, } from "./handler";
export { start, } from "./start";

/**
 * Exit code when first-boot contention is unrecoverable: this boot lost the
 * promotion claim and the winner's config.local.yaml never became readable
 * within the retry budget.
 * Contract: 75 → supervised restart expected (re-run adopts the winner's
 * file); 0 → clean shutdown; 1 → crash.
 */
export const FIRST_BOOT_RETRY_EXIT = 75;

/**
 * Map a startup failure to its process exit code: contention restarts
 * under a supervisor, everything else keeps the crash path.
 * @param error - Rejection from start().
 * @returns FIRST_BOOT_RETRY_EXIT for contention, 1 otherwise.
 */
export function startupExitCode(error: unknown,): number {
  if (error instanceof FirstBootContentionError) { return FIRST_BOOT_RETRY_EXIT; }
  return 1;
}

const isMainModule = typeof Bun !== "undefined" && (Bun as { main?: string }).main === import.meta.path;
if (isMainModule) {
  start().catch((error: unknown,) => {
    const conflict = portConflictMessage(error,);
    if (conflict !== null) {
      process.stderr.write(`${conflict}\n`,);
    } else {
      process.stderr.write(`[server] startup failed: ${String(error,)}\n`,);
    }

    process.exit(startupExitCode(error,),);
  },);
}
