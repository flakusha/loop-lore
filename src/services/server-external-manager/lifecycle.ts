// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { platform, } from "node:process";
import { stopLivenessProbes, } from "./probes";
import type { ServerExternalHost, ServerInstance, } from "./types";

/**
 * Stop a specific instance by type + port
 * @param host
 * @param instance
 */
export async function stop(host: ServerExternalHost, instance: ServerInstance,): Promise<void> {
  host.log.info("Stopping server", { type: instance.type, pid: instance.pid, },);

  // On Windows, process.kill() uses terminate() which doesn't accept signal strings
  if (platform === "win32") {
    instance.process.kill();
  } else {
    instance.process.kill("SIGTERM",);
    // Wait briefly for graceful shutdown
    await new Promise((r,) => setTimeout(r, 500,));
    if (!instance.process.killed) {
      instance.process.kill("SIGKILL",);
    }
  }
  const kept: ServerInstance[] = [];
  for (const i of host.instances) {
    if (i !== instance) { kept.push(i,); }
  }
  host.instances = kept;
}

/**
 * Stop all managed servers
 * @param host
 */
export async function stopAll(host: ServerExternalHost,): Promise<void> {
  stopLivenessProbes(host,);
  host.log.info("Stopping all managed servers", { count: host.instances.length, },);
  for (const instance of host.instances) {
    await stop(host, instance,);
  }
}

/**
 * Synchronous kill of all instances — for process.on('exit') handler.
 * Does not await, does not log (no event loop).
 * @param host
 */
export function killAllSync(host: ServerExternalHost,): void {
  stopLivenessProbes(host,);
  for (const instance of host.instances) {
    try {
      // On Windows, omit signal string (only SIGTERM/SIGKILL supported)
      if (platform === "win32") {
        process.kill(instance.pid,);
      } else {
        process.kill(instance.pid, "SIGKILL",);
      }
    } catch {
      // already dead — ignore
    }
  }
  host.instances.length = 0;
}
