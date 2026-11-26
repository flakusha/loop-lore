// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Run the decoy listener as a standalone process (never autostarted). */
import { loadConfig, } from "../config/load";
import { getDatabase, resetDatabaseSingleton, } from "../db";
import { createLogger, getLogger, } from "../logger";
import { loadHoneypotConfig, } from "./config";
import { assertPublicDecoyAllowed, startDecoyListener, } from "./decoy-listener";
import { createDecoyHitSink, } from "./ingest";

const configPath = process.env.HONEYPOT_CONFIG;
const fileConfig = configPath === undefined
  ? { denyRules: [], }
  : await loadHoneypotConfig(configPath,);

const host = process.env.HONEYPOT_HOST ?? fileConfig.host ?? "127.0.0.1";
const rawPort = process.env.HONEYPOT_PORT ?? String(fileConfig.port ?? 8099,);
const port = Number(rawPort,);
if (!Number.isInteger(port,) || port < 0 || port > 65_535) {
  process.stderr.write(`HONEYPOT_PORT must be an integer 0-65535, got ${rawPort}\n`,);
  process.exit(2,);
}

const rawTarpitMs = process.env.HONEYPOT_TARPIT_MS ?? String(fileConfig.tarpitMs ?? 0,);
const tarpitMs = Number(rawTarpitMs,);
if (!Number.isFinite(tarpitMs,) || tarpitMs < 0) {
  process.stderr.write(`HONEYPOT_TARPIT_MS must be a non-negative number, got ${rawTarpitMs}\n`,);
  process.exit(2,);
}

try {
  assertPublicDecoyAllowed(host, loadConfig().auth.required,);
} catch (error) {
  process.stderr.write(`${(error as Error).message}\n`,);
  process.exit(2,);
}

createLogger();
// Logs-only classification. No block decision, no caller-supplied ids.
const sink = createDecoyHitSink(getDatabase(), {
  enabled: process.env.HONEYPOT_CLASSIFICATION !== "0",
},);

const listener = startDecoyListener({
  denyRules: fileConfig.denyRules,
  host,
  maxConcurrentTarpits: fileConfig.maxConcurrentTarpits,
  onHit: (hit,) => {
    getLogger().info("honeypot hit", { module: "honeypot", ...hit, },);
    void sink(hit,);
  },
  port,
  tarpitMs,
},);

getLogger().info("honeypot decoy listener started", {
  module: "honeypot",
  url: listener.url,
},);

for (const signal of ["SIGINT", "SIGTERM",] as const) {
  process.on(signal, () => {
    void listener.stop().then(async () => {
      await resetDatabaseSingleton();
      process.exit(0,);
    },).catch((error: unknown,) => {
      process.stderr.write(`honeypot shutdown failed: ${String(error,)}\n`,);
      process.exit(1,);
    },);
  },);
}
