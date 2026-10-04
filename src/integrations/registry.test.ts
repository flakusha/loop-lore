// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the BridgeRegistry seam (spec §2.4).
 *
 * Stubs declare capabilities and target ownership; a hypothetical
 * EmailAdapter proves ProtocolAdapter stays implementable as declared.
 */
import { describe, expect, test, } from "bun:test";
import type { AdapterCapability, ProtocolAdapter, } from "./adapter";
import { createBridgeRegistry, } from "./registry";

interface StubOptions {
  capabilities?: AdapterCapability[];
  ownsTarget?: (target: string,) => boolean;
}

function makeAdapter(name: string, { capabilities = [], ownsTarget, }: StubOptions = {},): ProtocolAdapter {
  return {
    name,
    protocol: name,
    connect: async () => {},
    disconnect: async () => {},
    isConnected: () => true,
    isEncrypted: () => false,
    capabilities: () => [...capabilities,],
    sendMessage: async () => `${name}-sent`,
    onMessage: () => {},
    ownsTarget,
  };
}

/** Hypothetical email adapter — typecheck proof the seam fits email. */
class EmailAdapter implements ProtocolAdapter {
  readonly name = "email";
  readonly protocol = "smtp";

  async connect(_config: Record<string, unknown>,): Promise<void> {}

  async disconnect(): Promise<void> {}

  isConnected(): boolean {
    return true;
  }

  isEncrypted(): boolean {
    return false;
  }

  capabilities(): AdapterCapability[] {
    return ["auth-challenge",];
  }

  ownsTarget(address: string,): boolean {
    return address.includes("@",) && !address.startsWith("@",);
  }

  async sendMessage(
    _target: string,
    _message: Parameters<ProtocolAdapter["sendMessage"]>[1],
  ): Promise<string> {
    return "smtp-1";
  }

  onMessage(_handler: (message: never,) => void,): void {}
}

describe("BridgeRegistry", () => {
  test("registers, looks up, and lists in registration order", () => {
    const registry = createBridgeRegistry();
    const matrix = makeAdapter("matrix",);
    const irc = makeAdapter("irc",);
    expect(registry.register(matrix,),).toEqual({ ok: true, },);
    expect(registry.register(irc,),).toEqual({ ok: true, },);

    expect(registry.get("matrix",),).toBe(matrix,);
    expect(registry.get("nope",),).toBeUndefined();
    expect(registry.list(),).toEqual([matrix, irc,],);
  });

  test("register refuses a duplicate name and reports the incumbent", () => {
    const registry = createBridgeRegistry();
    const first = makeAdapter("matrix",);
    const second = makeAdapter("matrix",);
    expect(registry.register(first,),).toEqual({ ok: true, },);

    const rejected = registry.register(second,);
    expect(rejected.ok,).toBe(false,);
    if (!rejected.ok) {
      expect(rejected.code,).toBe("duplicate_name",);
      expect(rejected.existing,).toBe(first,);
    }

    expect(registry.get("matrix",),).toBe(first,);
  });

  test("unregister removes the adapter; unknown names report false", () => {
    const registry = createBridgeRegistry();
    registry.register(makeAdapter("xmpp",),);
    expect(registry.unregister("xmpp",),).toBe(true,);
    expect(registry.unregister("xmpp",),).toBe(false,);
    expect(registry.list(),).toEqual([],);
  });

  test("resolve returns the first adapter claiming the target", () => {
    const registry = createBridgeRegistry();
    const matrix = makeAdapter("matrix", { ownsTarget: (t,) => t.startsWith("@",), },);
    const eager = makeAdapter("eager", { ownsTarget: () => true, },);
    registry.register(matrix,);
    registry.register(eager,);

    expect(registry.resolve("@user:matrix.org",),).toBe(matrix,);
    expect(registry.resolve("#loop-lore",),).toBe(eager,);
  });

  test("resolve is undefined for unclaimed targets and adapters without ownsTarget", () => {
    const registry = createBridgeRegistry();
    registry.register(makeAdapter("blind",),);
    expect(registry.resolve("anything",),).toBeUndefined();
  });

  test("byCapability lists advertising adapters in order", () => {
    const registry = createBridgeRegistry();
    const editor = makeAdapter("matrix", { capabilities: ["message-edit",], },);
    const plain = makeAdapter("irc",);
    const authed = makeAdapter("email", { capabilities: ["auth-challenge", "message-edit",], },);
    registry.register(editor,);
    registry.register(plain,);
    registry.register(authed,);

    expect(registry.byCapability("message-edit",),).toEqual([editor, authed,],);
    expect(registry.byCapability("auth-challenge",),).toEqual([authed,],);
    expect(registry.byCapability("presence",),).toEqual([],);
  });

  test("negotiate confirms the capability on the owning adapter", () => {
    const registry = createBridgeRegistry();
    const matrix = makeAdapter("matrix", {
      capabilities: ["message-edit",],
      ownsTarget: (t,) => t.startsWith("@",),
    },);

    registry.register(matrix,);

    expect(registry.negotiate("@user:matrix.org", "message-edit",),).toEqual({ ok: true, adapter: matrix, },);
  });

  test("negotiate fails with unknown_target when no adapter owns the target", () => {
    const registry = createBridgeRegistry();
    registry.register(makeAdapter("irc", { ownsTarget: (t,) => t.startsWith("#",), },),);
    expect(registry.negotiate("@nobody:example.org", "message-edit",),).toEqual({
      ok: false,
      code: "unknown_target",
      message: "no adapter owns target: @nobody:example.org",
    },);
  });

  test("negotiate degrade path: capability_missing still hands back the owner", () => {
    const registry = createBridgeRegistry();
    const irc = makeAdapter("irc", { ownsTarget: () => true, },);
    registry.register(irc,);

    const missed = registry.negotiate("#loop-lore", "message-edit",);
    expect(missed,).toEqual({
      ok: false,
      code: "capability_missing",
      message: "adapter irc lacks capability: message-edit",
      adapter: irc,
    },);
  });
});

describe("ProtocolAdapter declarability", () => {
  test("a hypothetical EmailAdapter registers and negotiates for auth delivery", () => {
    const registry = createBridgeRegistry();
    const email = new EmailAdapter();
    expect(registry.register(email,),).toEqual({ ok: true, },);

    expect(registry.resolve("user@example.org",),).toBe(email,);
    expect(registry.negotiate("user@example.org", "auth-challenge",),).toEqual(
      { ok: true, adapter: email, },
    );
  });
});
