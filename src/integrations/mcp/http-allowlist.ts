// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/integrations/mcp/http-allowlist.ts — the DNS-rebinding allowlist of the
 * MCP Streamable HTTP transport, derived from the app's OWN configuration.
 *
 * The spec (2025-06-18 transports, Security Warning) requires the server to
 * validate the Origin header on every connection; the SDK ships the control
 * (`enableDnsRebindingProtection` + `allowedHosts`/`allowedOrigins`) and this
 * module computes the allowlist it enforces.
 *
 * The allowlist NEVER comes from the request: a rebinding attack controls the
 * Host header, so trusting it defeats the check. It comes from the instance's
 * own configuration:
 *  - `server.publicOrigin` when set — the origin clients actually use;
 *  - otherwise the bound host and port;
 *  - plus the loopback aliases (localhost, 127.0.0.1, [::1]) — a local
 *    client is legitimate, and a rebinding attack is not: its Host and Origin
 *    are the ATTACKER's names, never loopback ones.
 *
 * A WILDCARD bind address (0.0.0.0, ::) means the instance answers under
 * names the configuration cannot enumerate, so the allowlist cannot be
 * derived from the bind host. `server.publicOrigin` is then REQUIRED and its
 * absence is an actionable configuration error (the transport answers 503),
 * not a bare 403 that looks like an attack.
 *
 * Both schemes are allowed for every host: the config's TLS paths exist by
 * default, so the derived origin's scheme does not say whether the instance
 * actually serves TLS. The scheme is not the attack surface — the host is.
 */

import type { Config, } from "../../config/schema";
import { SERVER_DEFAULTS, type ServerConfig, } from "../../config/sections/server";
import { publicOriginOf, } from "../../federation/gossip";

/** The names a client on this machine may use. */
const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]",];

/** The bind addresses that mean "every interface". */
const WILDCARD_HOSTS: Record<string, true> = {
  "0.0.0.0": true,
  "::": true,
  "0:0:0:0:0:0:0:0": true,
  "*": true,
  "": true,
};

/** The allowlist the SDK transport enforces. */
export interface McpAllowlist {
  /** The Host header values the instance answers on. */
  readonly hosts: string[];
  /** The Origin header values the instance answers on. */
  readonly origins: string[];
}

/** The outcome of deriving the allowlist. */
export type AllowlistOutcome =
  | { ok: true; allowlist: McpAllowlist }
  | { ok: false; message: string };

/**
 * Normalize an origin to the form a browser sends (lowercase scheme and
 * host, no trailing slash, no default port).
 * @param origin - the origin to normalize
 * @returns the normalized origin, or null when the value is not an origin
 */
function normalizeOrigin(origin: string,): string | null {
  try {
    return new URL(origin,).origin;
  } catch {
    return null;
  }
}

/**
 * Whether a bind address is a wildcard (every interface).
 * @param host - the configured bind host
 * @returns true when the instance answers under names the config cannot enumerate
 */
function isWildcardHost(host: string,): boolean {
  const bare = host.trim().toLowerCase().replace(/^\[|\]$/gu, "",);
  return WILDCARD_HOSTS[bare] === true;
}

/**
 * The Host header values one name may arrive as: the name itself, the name
 * without a port, and the name with the instance's port.
 * @param name - the host name
 * @param port - the instance's port
 * @returns the Host header values for that name
 */
function hostForms(name: string, port: number,): string[] {
  return [name, name.replace(/:\d+$/u, "",), `${name}:${port}`,];
}

/**
 * Derive the DNS-rebinding allowlist from the app's own configuration.
 * @param config - the app config
 * @returns the allowlist, or the actionable message when it cannot be derived
 */
export function allowlistFor(config: Config | undefined,): AllowlistOutcome {
  // A mount without a server section (a bare app) falls back to the app's
  // DEFAULT server config — never to the request's own Host header.
  const server: ServerConfig = config?.server ?? SERVER_DEFAULTS;
  const { host, port, } = server;
  const configured = server.publicOrigin;
  const wildcard = isWildcardHost(host,);

  if (wildcard && configured === undefined) {
    return {
      ok: false,
      message: "server.publicOrigin is required when server.host is a wildcard address: set it " +
        "(SERVER_PUBLIC_ORIGIN) to the origin clients use, e.g. https://lore.example.com",
    };
  }

  const canonical = normalizeOrigin(configured ?? publicOriginOf(server,),) ?? "";
  const names = new Set<string>();
  const candidates = [
    canonical === "" ? "" : new URL(canonical,).host,
    ...(wildcard ? [] : [host,]),
    ...LOOPBACK_HOSTS,
  ];

  for (const name of candidates) {
    if (name === "") { continue; }
    for (const form of hostForms(name, port,)) { names.add(form,); }
  }

  const hosts = [...names,];
  const origins = new Set<string>();
  for (const name of hosts) {
    origins.add(`http://${name}`,);
    origins.add(`https://${name}`,);
  }

  if (canonical !== "") { origins.add(canonical,); }

  return { ok: true, allowlist: { hosts, origins: [...origins,], }, };
}
