// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Run the decoy listener as a standalone process (never autostarted). */
import { createLogger, getLogger, } from "../logger";
import { startDecoyListener, } from "./decoy-listener";

const host = process.env.HONEYPOT_HOST ?? "127.0.0.1";
const rawPort = process.env.HONEYPOT_PORT ?? "8099";
const port = Number(rawPort,);
if (!Number.isInteger(port,) || port < 0 || port > 65_535) {
  process.stderr.write(`HONEYPOT_PORT must be an integer 0-65535, got ${rawPort}\n`,);
  process.exit(2,);
}

createLogger();
const listener = startDecoyListener({
  host,
  onHit: (hit,) => {
    getLogger().info("honeypot hit", { module: "honeypot", ...hit, },);
  },
  port,
},);

getLogger().info("honeypot decoy listener started", {
  module: "honeypot",
  url: listener.url,
},);

for (const signal of ["SIGINT", "SIGTERM",] as const) {
  process.on(signal, () => {
    void listener.stop().then(() => process.exit(0,));
  },);
}
