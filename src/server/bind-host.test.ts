// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { serve, } from "bun";
import { describe, expect, test, } from "bun:test";
import { ipLiteral, resolveBindHost, selectBindAddress, } from "./bind-host";
import { portConflictMessage, } from "./port-conflict";

describe("selectBindAddress", () => {
  test("prefers IPv4 and picks the same address from the same set", () => {
    expect(selectBindAddress(["::1", "127.0.0.1", "127.0.0.2",],),).toBe("127.0.0.1",);
    expect(selectBindAddress(["::1", "127.0.0.2", "127.0.0.1",],),).toBe("127.0.0.1",);
  });

  test("falls back to IPv6 when there is no IPv4 address", () => {
    expect(selectBindAddress(["fe80::1", "::1",],),).toBe("::1",);
  });

  test("returns null when nothing resolves", () => {
    expect(selectBindAddress([],),).toBeNull();
  });
});

describe("resolveBindHost", () => {
  test("pins one address for a name, the same on every boot", async () => {
    const first = await resolveBindHost({ host: "localhost", },);
    const second = await resolveBindHost({ host: "localhost", },);
    expect(first,).toBe(second,);
    expect(ipLiteral(first,),).not.toBeNull();
  });

  test("leaves an IP literal alone (wildcard and IPv6 included)", async () => {
    expect(await resolveBindHost({ host: "0.0.0.0", },),).toBe("0.0.0.0",);
    expect(await resolveBindHost({ host: "::1", },),).toBe("::1",);
    expect(await resolveBindHost({ host: "127.0.0.1", },),).toBe("127.0.0.1",);
    expect(await resolveBindHost({ host: "[::1]", },),).toBe("::1",);
  });

  test("a name that cannot resolve reports the host and the fix", async () => {
    const failure = await resolveBindHost({ host: "loop-lore-no-such-host.invalid", },).catch(
      (error: unknown,) => error,
    );

    expect(failure,).toBeInstanceOf(Error,);
    const message = (failure as Error).message;
    expect(message,).toContain("loop-lore-no-such-host.invalid",);
    expect(message,).toContain("could not be resolved",);
    expect(message,).toContain("set server.host",);
  });
});

/**
 * @param error - the caught error
 * @returns the error code, when the error carries one
 */
function errorCode(error: unknown,): string | undefined {
  if (typeof error !== "object" || error === null) { return undefined; }
  if (!("code" in error)) { return undefined; }
  const { code, } = error;
  return typeof code === "string" ? code : undefined;
}

describe("a second instance on the same port", () => {
  test("fails loudly instead of splitting the address family", async () => {
    const address = await resolveBindHost({ host: "localhost", },);
    const first = serve({ port: 0, hostname: address, fetch: () => new Response("ok",), },);
    let failure: unknown = null;
    try {
      serve({ port: first.port, hostname: address, fetch: () => new Response("ok",), },);
    } catch (error) {
      failure = error;
    } finally {
      first.stop(true,);
    }

    expect(failure,).not.toBeNull();
    expect(errorCode(failure,),).toBe("EADDRINUSE",);
    const message = portConflictMessage(failure,);
    expect(message,).toContain("--instance",);
    expect(message,).toContain("LOOP_LORE_INSTANCE",);
  });
});
