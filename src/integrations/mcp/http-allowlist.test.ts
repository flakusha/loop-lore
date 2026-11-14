// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/integrations/mcp/http-allowlist.test.ts — the DNS-rebinding allowlist
 * derived from the app's OWN configuration.
 *
 * Pinned here:
 *  - a wildcard bind with no public origin cannot be answered (the message
 *    names server.publicOrigin / SERVER_PUBLIC_ORIGIN);
 *  - a wildcard bind WITH a public origin answers under that origin's host
 *    plus the loopback aliases;
 *  - the default bind answers the loopback aliases too;
 *  - a rebinding origin is never allowed, in any configuration.
 */

import { describe, expect, test, } from "bun:test";
import type { Config, } from "../../config/schema";
import { allowlistFor, } from "./http-allowlist";

/**
 * A config carrying just the server section the allowlist reads.
 * @param server - the server section
 * @returns the config
 */
function configWith(server: Record<string, unknown>,): Config {
  return { server, } as unknown as Config;
}

describe("MCP DNS-rebinding allowlist", () => {
  test("a wildcard bind without a public origin cannot be answered", () => {
    const outcome = allowlistFor(configWith({ host: "0.0.0.0", port: 3000, },),);

    expect(outcome.ok,).toBe(false,);
    const message = outcome.ok ? "" : outcome.message;
    expect(message,).toContain("server.publicOrigin",);
    expect(message,).toContain("SERVER_PUBLIC_ORIGIN",);
  });

  test("a wildcard bind with a public origin answers under that origin's host", () => {
    const outcome = allowlistFor(configWith({
      host: "0.0.0.0",
      port: 3000,
      publicOrigin: "https://lore.example.com",
    },),);

    expect(outcome.ok,).toBe(true,);
    const allowlist = outcome.ok ? outcome.allowlist : { hosts: [], origins: [], };
    expect(allowlist.hosts,).toContain("lore.example.com",);
    expect(allowlist.hosts,).toContain("127.0.0.1:3000",);
    expect(allowlist.hosts,).not.toContain("attacker.example",);
    expect(allowlist.origins,).toContain("https://lore.example.com",);
    expect(allowlist.origins,).not.toContain("http://attacker.example",);
  });

  test("the default bind answers the loopback aliases", () => {
    const outcome = allowlistFor(configWith({ host: "localhost", port: 3000, },),);

    expect(outcome.ok,).toBe(true,);
    const hosts = outcome.ok ? outcome.allowlist.hosts : [];
    expect(hosts,).toContain("localhost:3000",);
    expect(hosts,).toContain("127.0.0.1:3000",);
    expect(hosts,).toContain("[::1]:3000",);
  });

  test("a rebinding origin is never allowed", () => {
    for (
      const server of [
        { host: "localhost", port: 3000, },
        { host: "0.0.0.0", port: 3000, publicOrigin: "https://lore.example.com", },
        { host: "192.168.1.5", port: 3000, },
      ]
    ) {
      const outcome = allowlistFor(configWith(server,),);
      const hosts = outcome.ok ? outcome.allowlist.hosts : [];
      const origins = outcome.ok ? outcome.allowlist.origins : [];
      expect(hosts,).not.toContain("attacker.example",);
      expect(origins,).not.toContain("http://attacker.example",);
    }
  });
});
