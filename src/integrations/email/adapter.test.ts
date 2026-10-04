// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * EmailAdapter fixtures (federation-email-channel.md §2/§4).
 *
 * Transport is an in-memory fake, clock injected — no SMTP, no timers.
 * The wiring test composes adapter + spam gate + bridge exactly as the
 * §7/§9 seams prescribe.
 */
import { describe, expect, test, } from "bun:test";
import type { AdapterMessage, } from "../adapter";
import { createMessageBridge, } from "../bridge";
import { createBridgeRegistry, } from "../registry";
import {
  createEmailAdapter,
  EMAIL_SYNTHETIC_DOMAIN,
  EmailAdapterError,
  type EmailTransport,
  type EmailTransportMessage,
  type InboundEmail,
} from "./adapter";
import { createEmailSpamGate, } from "./spam-gate";

function captureTransport(
  sent: EmailTransportMessage[],
  id = "<fixed@sender.example>",
): EmailTransport {
  return {
    send: async (message,) => {
      sent.push(message,);
      return id;
    },
  };
}

function inboundMail(overrides: Partial<InboundEmail> = {},): InboundEmail {
  return {
    messageId: "<abc@sender.example>",
    from: "Alice <alice@sender.example>",
    to: ["user@loop.example",],
    subject: "Hello",
    body: "World",
    date: 42,
    ...overrides,
  };
}

describe("EmailAdapter lifecycle", () => {
  test("connect binds the config section and reports the addresses", async () => {
    const adapter = createEmailAdapter();
    expect(adapter.isConnected(),).toBe(false,);
    expect(adapter.fromAddress,).toBeUndefined();

    await adapter.connect({ smtpUser: "bot@loop.example", mailboxAddress: "inbox@loop.example", },);
    expect(adapter.isConnected(),).toBe(true,);
    expect(adapter.fromAddress,).toBe("bot@loop.example",);
    expect(adapter.mailboxAddress,).toBe("inbox@loop.example",);
  });

  test("connect without any address rejects typed not_configured", async () => {
    const adapter = createEmailAdapter();
    const error = await adapter.connect({ imapUser: "", },).then(() => null, (cause: unknown,) => cause,);
    expect(error,).toBeInstanceOf(EmailAdapterError,);
    expect((error as EmailAdapterError).code,).toBe("not_configured",);
    expect(adapter.isConnected(),).toBe(false,);
  });

  test("disconnect drops the connection and send fails typed", async () => {
    const adapter = createEmailAdapter({ transport: captureTransport([],), },);
    await adapter.connect({ smtpUser: "bot@loop.example", },);
    await adapter.disconnect();
    expect(adapter.isConnected(),).toBe(false,);

    const error = await adapter.sendMessage("dest@other.test", { author: "loop-lore", body: "hi", timestamp: 1, },)
      .then(() => null, (cause: unknown,) => cause,);

    expect(error,).toBeInstanceOf(EmailAdapterError,);
    expect((error as EmailAdapterError).code,).toBe("not_configured",);
  });
});

describe("EmailAdapter.sendMessage", () => {
  test("delegates to the transport seam with the §4 envelope", async () => {
    const sent: EmailTransportMessage[] = [];
    const adapter = createEmailAdapter({ transport: captureTransport(sent,), },);
    await adapter.connect({ smtpUser: "bot@loop.example", },);

    const id = await adapter.sendMessage("dest@other.test", { author: "loop-lore", body: "hi there", timestamp: 1, },);
    expect(id,).toBe("<fixed@sender.example>",);
    expect(sent,).toEqual([
      { from: "bot@loop.example", to: "dest@other.test", body: "hi there", },
    ],);
  });

  test("synthesizes a Message-ID when the transport returns none", async () => {
    const adapter = createEmailAdapter({ transport: captureTransport([], "",), },);
    await adapter.connect({ smtpUser: "bot@loop.example", },);
    const id = await adapter.sendMessage("dest@other.test", { author: "loop-lore", body: "hi", timestamp: 1, },);
    expect(id,).toMatch(/^<[0-9a-f-]{36}@loop\.example>$/,);
  });

  test("rejects typed not_configured without a transport", async () => {
    const adapter = createEmailAdapter();
    await adapter.connect({ smtpUser: "bot@loop.example", },);
    const error = await adapter.sendMessage("dest@other.test", { author: "loop-lore", body: "hi", timestamp: 1, },)
      .then(() => null, (cause: unknown,) => cause,);

    expect(error,).toBeInstanceOf(EmailAdapterError,);
    expect((error as EmailAdapterError).code,).toBe("not_configured",);
  });

  test("propagates transport failures for the bridge to classify", async () => {
    const adapter = createEmailAdapter({
      transport: {
        send: async () => {
          throw new Error("smtp down",);
        },
      },
    },);

    await adapter.connect({ smtpUser: "bot@loop.example", },);
    expect(adapter.sendMessage("dest@other.test", { author: "loop-lore", body: "hi", timestamp: 1, },),)
      .rejects
      .toThrow("smtp down",);
  });
});

describe("EmailAdapter.ingest", () => {
  test("maps the §4 table onto the bridge envelope", () => {
    const adapter = createEmailAdapter();
    expect(adapter.ingest(inboundMail(),),).toEqual({
      id: "<abc@sender.example>",
      author: "alice@sender.example",
      target: "user@loop.example",
      body: "Hello\n\nWorld",
      timestamp: 42,
    },);
  });

  test("targets the configured mailbox even when only cc'd", async () => {
    const adapter = createEmailAdapter();
    await adapter.connect({ smtpUser: "bot@loop.example", mailboxAddress: "inbox@loop.example", },);
    const envelope = adapter.ingest(inboundMail({ to: ["other@x.test", "Inbox@Loop.example",], },),);
    expect(envelope.target,).toBe("inbox@loop.example",);
  });

  test("falls back to the first recipient without a configured mailbox", async () => {
    const adapter = createEmailAdapter();
    await adapter.connect({ smtpUser: "bot@loop.example", },);
    const envelope = adapter.ingest(inboundMail({ to: ["a@b.test", "c@d.test",], },),);
    expect(envelope.target,).toBe("a@b.test",);
  });

  test("synthesizes a redelivery-stable id when Message-ID is missing", () => {
    const adapter = createEmailAdapter();
    const first = adapter.ingest(inboundMail({ messageId: undefined, },),);
    const second = adapter.ingest(inboundMail({ messageId: undefined, },),);
    expect(first.id,).toBe(second.id,);
    expect(first.id,).toMatch(new RegExp(`^<[0-9a-f]{32}@${EMAIL_SYNTHETIC_DOMAIN.replace(".", "\\.",)}>$`,),);
  });

  test("uses the injected clock when Date is absent", () => {
    const adapter = createEmailAdapter({ now: () => 7, },);
    expect(adapter.ingest(inboundMail({ date: undefined, },),).timestamp,).toBe(7,);
  });

  test("hands the envelope to the registered handler", () => {
    const adapter = createEmailAdapter();
    const received: AdapterMessage[] = [];
    adapter.onMessage((message,) => {
      received.push(message,);
    },);

    const envelope = adapter.ingest(inboundMail(),);
    expect(received,).toEqual([envelope,],);
  });

  test("is a no-op on the handler path when nothing is registered", () => {
    const adapter = createEmailAdapter();
    expect(adapter.ingest(inboundMail(),).id,).toBe("<abc@sender.example>",);
  });
});

describe("EmailAdapter adapter contract", () => {
  test("reports plaintext transport and no capabilities (§7)", () => {
    const adapter = createEmailAdapter();
    expect(adapter.isEncrypted(),).toBe(false,);
    expect(adapter.capabilities(),).toEqual([],);
  });

  test("owns address-shaped targets only", () => {
    const adapter = createEmailAdapter();
    expect(adapter.ownsTarget?.("user@example.com",),).toBe(true,);
    expect(adapter.ownsTarget?.("User@Example.COM",),).toBe(true,);
    expect(adapter.ownsTarget?.("@user:matrix.org",),).toBe(false,);
    expect(adapter.ownsTarget?.("not-an-address",),).toBe(false,);
  });
});

describe("email family wiring (gate → bridge)", () => {
  test("outbound rides the bridge into the transport; inbound rides ingest into the bridge", async () => {
    const sent: EmailTransportMessage[] = [];
    const adapter = createEmailAdapter({ transport: captureTransport(sent,), },);
    await adapter.connect({ smtpUser: "bot@loop.example", mailboxAddress: "inbox@loop.example", },);

    const registry = createBridgeRegistry();
    registry.register(adapter,);
    const gate = createEmailSpamGate({ allowList: ["friend@sender.example",], },);
    const received: AdapterMessage[] = [];
    const bridge = createMessageBridge(registry, {
      inboundGate: (message,) =>
        gate.check(message,).action === "deliver"
          ? { ok: true, }
          : { ok: false, code: "inbound_blocked", message: "spam gate", },
    },);

    bridge.onMessage((message,) => {
      received.push(message,);
    },);

    adapter.onMessage((message,) => {
      bridge.receive("email", message,);
    },);

    const outbound = await bridge.send("dest@other.test", {
      id: "local-1",
      author: "loop-lore",
      target: "dest@other.test",
      body: "ping",
      timestamp: 1,
    },);

    expect(outbound.ok,).toBe(true,);
    expect(sent.map((message,) => message.to),).toEqual(["dest@other.test",],);

    adapter.ingest(inboundMail({ from: "Friend <friend@sender.example>", },),);
    expect(received.map((message,) => message.author),).toEqual(["friend@sender.example",],);

    // A quarantined sender never reaches the chat.
    adapter.ingest(inboundMail({
      from: "stranger@other.test",
      messageId: "<zz@other.test>",
      subject: "Buy",
      body: "things",
    },),);

    expect(received,).toHaveLength(1,);
  });
});
