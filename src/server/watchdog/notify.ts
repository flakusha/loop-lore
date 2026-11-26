// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Dispatch the heavy gate when the watchdog crash threshold is breached. */
import { createLogger, } from "../../logger";
import { safeFetch, } from "../../utils/safe-fetch";
import type { WatchdogAlert, } from "./supervisor";

const logger = createLogger();

let lastDispatchAt: number | undefined;

/**
 * Fire-and-forget notification for the watchdog stop path.
 * Never throws: a broken dispatch must not stall the supervisor.
 */
export async function notifyOnCrashThreshold(info: WatchdogAlert,): Promise<void> {
  try {
    const token = process.env.LOOP_LORE_GITHUB_TOKEN;
    const repository = process.env.LOOP_LORE_GITHUB_REPOSITORY;
    if (!token || !repository) {
      logger.warn("Watchdog gate dispatch skipped: missing GitHub credentials", {
        hasToken: Boolean(token,),
        hasRepository: Boolean(repository,),
      },);

      return;
    }

    const now = Date.now();
    if (lastDispatchAt !== undefined && now - lastDispatchAt < info.windowMs) {
      return;
    }

    const result = await safeFetch(
      `https://api.github.com/repos/${repository}/dispatches`,
      {
        method: "POST",
        body: {
          event_type: "watchdog.threshold_breach",
          client_payload: { ...info, source: "watchdog", },
        },
        auth: {
          authorization: `Bearer ${token}`,
          extraHeaders: {
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        },
        timeout: 5000,
        parseJson: false,
        handle401: false,
      },
    );

    if (!result.ok) {
      logger.warn("Watchdog gate dispatch rejected", {
        status: result.status,
        error: result.error.message,
      },);

      return;
    }

    lastDispatchAt = now;
  } catch (error) {
    logger.error(
      "Watchdog gate dispatch failed",
      error instanceof Error ? error : undefined,
      {},
    );
  }
}
