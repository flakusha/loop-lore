// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Optional TOML config for the standalone decoy process. The main app config
 * never loads this file; the decoy stays detachable and inert.
 */
import type { DecoyDenyRule, } from "./decoy-listener";

/** Parsed decoy config. Every field is optional except the deny-rule list. */
export interface HoneypotConfig {
  denyRules: readonly DecoyDenyRule[];
  host?: string;
  maxConcurrentTarpits?: number;
  port?: number;
  tarpitMs?: number;
}

/**
 * Validate and shape one parsed TOML value.
 * @param value
 * @returns a validated decoy config
 * @throws when a field is malformed or out of range
 */
export function parseHoneypotConfig(value: unknown,): HoneypotConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value,)) {
    throw new Error("honeypot config must be a TOML table",);
  }

  const raw = value as Record<string, unknown>;
  const config: HoneypotConfig = { denyRules: [], };

  if (raw.host !== undefined) {
    if (typeof raw.host !== "string" || raw.host.length === 0) {
      throw new Error("honeypot config: host must be a non-empty string",);
    }

    config.host = raw.host;
  }

  if (raw.port !== undefined) {
    if (typeof raw.port !== "number" || !Number.isInteger(raw.port,) || raw.port < 0 || raw.port > 65_535) {
      throw new Error("honeypot config: port must be an integer 0-65535",);
    }

    config.port = raw.port;
  }

  for (const field of ["tarpitMs", "maxConcurrentTarpits",] as const) {
    const input = raw[field];
    if (input === undefined) { continue; }
    if (typeof input !== "number" || !Number.isFinite(input,) || input < 0) {
      throw new Error(`honeypot config: ${field} must be a non-negative number`,);
    }

    config[field] = field === "tarpitMs" ? Math.min(500, input,) : Math.max(1, Math.floor(input,),);
  }

  if (raw.deny !== undefined) {
    if (!Array.isArray(raw.deny,)) {
      throw new Error("honeypot config: deny must be an array of tables",);
    }

    config.denyRules = raw.deny.map((entry: unknown, index: number,) => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry,)) {
        throw new Error(`honeypot config: deny[${index}] must be a table`,);
      }

      const rule = entry as Record<string, unknown>;
      const deny: DecoyDenyRule = {};
      if (rule.ip !== undefined) {
        if (typeof rule.ip !== "string" || rule.ip.length === 0) {
          throw new Error(`honeypot config: deny[${index}].ip must be a string`,);
        }

        deny.ip = rule.ip;
      }

      if (rule.userAgent !== undefined) {
        if (typeof rule.userAgent !== "string" || rule.userAgent.length === 0) {
          throw new Error(`honeypot config: deny[${index}].userAgent must be a string`,);
        }

        deny.userAgent = rule.userAgent;
      }

      if (deny.ip === undefined && deny.userAgent === undefined) {
        throw new Error(`honeypot config: deny[${index}] needs ip or userAgent`,);
      }

      return deny;
    },);
  }

  return config;
}

/**
 * Read a decoy config file using the Bun TOML parser.
 * @param path
 * @returns validated config
 */
export async function loadHoneypotConfig(path: string,): Promise<HoneypotConfig> {
  const text = await Bun.file(path,).text();
  return parseHoneypotConfig(Bun.TOML.parse(text,),);
}
