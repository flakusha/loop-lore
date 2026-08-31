// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { safeFetch, } from "../../utils";

import type { ServerExternalHost, ServerInstance, } from "./types";

/**
 * Start periodic health checks on all managed servers.
 * Logs warning on first failure, error on repeated failures.
 * @param host
 */
export function startLivenessProbes(host: ServerExternalHost,): void {
  if (host.probeTimer) { return; }
  host.probeTimer = setInterval(() => {
    void (async () => {
      try {
        await checkAllLiveliness(host,);
      } catch {
        /* liveness probe — non-critical */
      }
    })();
  }, host.PROBE_INTERVAL_MS,);
  host.log.debug("Liveliness probes started", { intervalMs: host.PROBE_INTERVAL_MS, },);
}

/**
 * Stop periodic health checks
 * @param host
 */
export function stopLivenessProbes(host: ServerExternalHost,): void {
  if (!host.probeTimer) {
    return;
  }

  clearInterval(host.probeTimer,);
  host.probeTimer = null;
  host.log.debug("Liveliness probes stopped",);
}

/**
 * Run a single liveness check against all managed instances
 * @param host
 */
export async function checkAllLiveliness(host: ServerExternalHost,): Promise<void> {
  for (const instance of host.instances) {
    const alive = await probeInstance(instance,);
    if (!alive) {
      host.log.warn("External server unresponsive", {
        type: instance.type,
        port: instance.pid,
        pid: instance.pid,
      },);
    }
  }
}

/**
 * Probe a single instance — returns true if responsive
 * @param instance
 */
async function probeInstance(instance: ServerInstance,): Promise<boolean> {
  try {
    if (instance.type === "llama-cpp") {
      const result = await safeFetch<string>(`http://127.0.0.1:${instance.port}/health`, {
        timeout: 5_000,
        parseJson: false,
      },);
      return result.ok;
    }
    if (instance.type === "llama-swap") {
      // No guaranteed /health route; probe the OpenAI models endpoint.
      const result = await safeFetch(`http://127.0.0.1:${instance.port}/v1/models`, {
        timeout: 5_000,
      },);
      // Any HTTP response (any status) means the server is alive.
      return result.ok || result.status !== undefined;
    }
    // sd-cpp: any TCP response = alive
    const result = await safeFetch(`http://127.0.0.1:${instance.port}/`, {
      timeout: 5_000,
    },);
    return result.ok || result.status !== undefined;
  } catch {
    return false;
  }
}
