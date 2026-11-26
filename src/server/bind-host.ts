// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/server/bind-host.ts — Deterministic bind-address resolution.
//
// Bun.serve({ hostname }) resolves the name itself and binds the FIRST
// address the resolver hands back. A second process asking for the same
// port then binds the NEXT address of the same name — a silent split across
// address families: two "running" instances, one port, no error, no log
// line. Resolving the name ONCE and handing Bun a literal pins the bind, so
// the second instance collides loudly with EADDRINUSE instead.
//
// Runtime boundary: this module uses only the Node-compatible stdlib
// (node:dns, node:net), so the resolver itself is runtime-agnostic. The
// Bun-only surface is the listener (`serve` from "bun") in start.ts.

import { lookup, } from "node:dns/promises";
import { isIP, } from "node:net";

/** Options for {@link resolveBindHost}. */
export interface ResolveBindHostOptions {
  /** The configured host: a name ("localhost") or an IP literal ("127.0.0.1"). */
  host: string;
}

/**
 * @param host - a host string
 * @returns the bare IP literal when `host` is one (brackets stripped), else null
 */
export function ipLiteral(host: string,): string | null {
  const bare = host.startsWith("[",) && host.endsWith("]",) ? host.slice(1, -1,) : host;
  return isIP(bare,) !== 0 ? bare : null;
}

/**
 * Pick the ONE address to bind: IPv4 first (the family the shipped defaults
 * and the container healthcheck use), IPv6 as the fallback; sorted inside a
 * family so the pick does not move between boots.
 * @param addresses - the resolved addresses
 * @returns the pinned address, or null when the list holds no address
 */
export function selectBindAddress(addresses: readonly string[],): string | null {
  const ipv4 = addresses.filter((address,) => isIP(address,) === 4).toSorted();
  if (ipv4.length > 0) { return ipv4[0] ?? null; }
  const ipv6 = addresses.filter((address,) => isIP(address,) === 6).toSorted();
  return ipv6[0] ?? null;
}

/**
 * Resolve the configured host to the single address the listener binds.
 * An IP literal passes through untouched (so "0.0.0.0" still binds every
 * interface and "::1" still binds IPv6 only); a name is resolved once and
 * pinned to one address.
 * @param options - the configured host
 * @throws {Error} When the host is a name that cannot be resolved, or resolves
 *   to no address
 * @returns the literal address to bind
 */
export async function resolveBindHost(options: ResolveBindHostOptions,): Promise<string> {
  const host = options.host.trim();
  const literal = ipLiteral(host,);
  if (host === "") { return host; }
  if (literal !== null) { return literal; }
  const resolved = await lookup(host, { all: true, verbatim: true, },).catch((cause: unknown,) => {
    const reason = cause instanceof Error ? cause.message : String(cause,);
    throw new Error(`host "${host}" could not be resolved: ${reason} — set server.host to an address that resolves`, {
      cause,
    },);
  },);

  const address = selectBindAddress(resolved.map((entry,) => entry.address),);
  if (address === null) {
    throw new Error(`host "${host}" resolves to no address — set server.host to an address that exists`,);
  }

  return address;
}
