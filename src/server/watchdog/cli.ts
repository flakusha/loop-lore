// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** `bun run watchdog` — supervise the loop-lore server process. */
import { join, resolve, } from "node:path";
import { createLogger, } from "../../logger";
import { DEFAULT_POLICY, } from "./state";
import { createSupervisor, defaultProbe, defaultSpawn, } from "./supervisor";

const rootDir = resolve(import.meta.dir, "../../..",);
// `start.ts` only exports start(); index.ts is the runnable entrypoint (and
// owns the first-boot contention exit code). The ticket's older path is stale.
const startPath = join(rootDir, "src/server/index.ts",);
const port = process.env.PORT ?? "3000";
const healthUrl = process.env.WATCHDOG_HEALTH_URL ?? `http://127.0.0.1:${port}/health/live`;

const logger = createLogger();
const supervisor = createSupervisor({
  spawn: () => defaultSpawn({ rootDir, startPath, },),
  probe: defaultProbe(healthUrl, DEFAULT_POLICY.probeTimeoutMs,),
  logger,
  alert: (info,) => logger.fatal("Watchdog stopping after repeated crashes", undefined, { ...info, },),
},);

for (const signal of ["SIGTERM", "SIGINT",] as const) {
  process.on(signal, () => supervisor.stop(signal,),);
}

const exitCode = await supervisor.run();
await logger.flush();
process.exit(exitCode,);
