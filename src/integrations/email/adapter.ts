// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/integrations/email/adapter.ts — EmailAdapter, the email
// ProtocolAdapter (federation-email-channel.md §2, TASK-email-integration).
//
// Layering per integrations-architecture.md §1: this adapter owns protocol
// framing — RFC 5322 envelope ↔ AdapterMessage mapping (§4 table) — and
// delegates byte transport to the pluggable {@link EmailTransport} seam.
// Real SMTP/IMAP clients (nodemailer/imapflow) stay behind the lazy-load
// rule (§8.3, TASK-email-deps-as-opt-in): they arrive as transport
// implementations loaded only when integrations.email is configured — this
// module imports none of them. Inbound path: parse → AdapterMessage → the
// registered handler (the wiring bridges it into MessageBridge.receive,
// with the spam gate as the bridge's inboundGate — §7).

import { createHash, randomUUID, } from "node:crypto";
import { safeJsonStringify, } from "../../utils/safe-json";
import type { AdapterMessage, AdapterMessageHandler, ProtocolAdapter, } from "../adapter";
import { senderAddress, } from "./spam-gate";

/** Adapter identity used for registry registration and bridge routing. */
export const EMAIL_ADAPTER_NAME = "email";

/** Domain used for synthesized Message-IDs when none is available. */
export const EMAIL_SYNTHETIC_DOMAIN = "loop-lore.local";

/** Typed adapter failure (spec §10); `not_configured` is the unconfigured
 * case — zero transport, zero address — never a crash. */
export class EmailAdapterError extends Error {
  /** Failure kind. */
  readonly code: "not_configured";

  constructor(code: "not_configured", message: string,) {
    super(message,);
    this.name = "EmailAdapterError";
    this.code = code;
  }
}

/** Outbound mail handed to the transport seam; the adapter owns the RFC
 * 5322 framing behind it. `subject` is transport policy — notification
 * templates are a later slice — so the adapter leaves it unset. */
export interface EmailTransportMessage {
  /** Sending address (the configured mailbox). */
  from: string;
  /** Recipient address (the bridge target). */
  to: string;
  /** Plain-text body. */
  body: string;
  /** Optional subject; unset by this adapter (transport/templates decide). */
  subject?: string;
}

/** Byte-transport seam: the ONLY thing that touches SMTP. Implementations
 * backed by nodemailer arrive via lazy dynamic import (§8.3); tests use
 * in-memory fakes. */
export interface EmailTransport {
  /** Send one message; resolves with its Message-ID ("" if the server
   * does not return one — the adapter synthesizes a stable fallback). */
  send(message: EmailTransportMessage,): Promise<string>;
}

/** Inbound mail to map onto the bridge envelope (§4). A webhook relay POSTs
 * this parsed shape; the future IMAP fetch maps MIME parts into it. */
export interface InboundEmail {
  /** From header value (bare address or display-name form). */
  from: string;
  /** To/Cc recipients. */
  to: readonly string[];
  /** Plain-text body. */
  body: string;
  /** Message-ID header; synthesized deterministically when absent. */
  messageId?: string;
  /** Subject header; prefixed onto the body per §4 ("Subject + body"). */
  subject?: string;
  /** Date header, ms since epoch; injected clock when absent. */
  date?: number;
}

/** The email adapter: ProtocolAdapter plus the family-owned ingest seam. */
export interface EmailAdapter extends ProtocolAdapter {
  /** Sending address bound by connect (the SMTP user), if any. */
  readonly fromAddress: string | undefined;
  /** Receive-side mailbox bound by connect, if any. */
  readonly mailboxAddress: string | undefined;
  /** Map one inbound mail onto the bridge envelope (§4) and hand it to the
   * registered handler. Pure aside from the handler call — the WIRING
   * forwards the envelope into MessageBridge.receive with the spam gate
   * as the bridge's inboundGate. */
  ingest(raw: InboundEmail,): AdapterMessage;
}

/** Options for {@link createEmailAdapter}. */
export interface EmailAdapterOptions {
  /** Outbound transport seam; without one, sendMessage fails typed. */
  transport?: EmailTransport;
  /** Clock injection for deterministic tests; default `Date.now`. */
  now?: () => number;
}

/** Address-shape test: the adapter owns address-looking bridge targets.
 * @param target Bridge target string.
 * @returns True when the target looks like an email address.
 */
function isEmailAddress(target: string,): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target,);
}

/** Domain of an address, lowercased; synthetic-domain fallback.
 * @param address Bare address.
 * @returns The domain part, or the synthetic domain.
 */
function domainOf(address: string,): string {
  const at = address.lastIndexOf("@",);
  return at === -1 ? EMAIL_SYNTHETIC_DOMAIN : address.slice(at + 1,).toLowerCase() || EMAIL_SYNTHETIC_DOMAIN;
}

/** Redelivery-stable Message-ID for mail without one: a content digest, so
 * a webhook/IMAP redelivery dedups instead of double-delivering.
 * @param raw Inbound mail payload.
 * @returns The `<digest@domain>` Message-ID.
 */
function stableMessageId(raw: InboundEmail,): string {
  const serialized = safeJsonStringify([raw.from, [...raw.to,], raw.subject ?? "", raw.body, raw.date ?? -1,],);
  const digest = createHash("sha256",)
    .update(serialized.ok ? serialized.value : "",)
    .digest("hex",)
    .slice(0, 32,);

  return `<${digest}@${EMAIL_SYNTHETIC_DOMAIN}>`;
}

/**
 * Build the email adapter (TASK-email-integration, green-field slice).
 * connect() binds the email config section (`smtpUser` is the sending
 * address; `mailboxAddress` the receive mailbox — both from the section,
 * spread as a plain record); sendMessage delegates to the injected
 * transport; ingest() maps inbound mail per §4.
 * @param options Transport seam + clock injection.
 * @returns The adapter.
 */
export function createEmailAdapter(options: EmailAdapterOptions = {},): EmailAdapter {
  const now = options.now ?? (() => Date.now());
  let fromAddress: string | undefined;
  let mailboxAddress: string | undefined;
  let connected = false;
  let handler: AdapterMessageHandler | null = null;

  const adapter: EmailAdapter = {
    name: EMAIL_ADAPTER_NAME,
    protocol: EMAIL_ADAPTER_NAME,

    get fromAddress() {
      return fromAddress;
    },
    get mailboxAddress() {
      return mailboxAddress;
    },

    async connect(config,) {
      const record = typeof config === "object" && config !== null
        ? config as Record<string, unknown>
        : {};

      const smtpUser = typeof record.smtpUser === "string" && record.smtpUser.trim() !== ""
        ? record.smtpUser.trim().toLowerCase()
        : undefined;

      const mailbox = typeof record.mailboxAddress === "string" && record.mailboxAddress.trim() !== ""
        ? record.mailboxAddress.trim().toLowerCase()
        : undefined;

      if (smtpUser === undefined && mailbox === undefined) {
        throw new EmailAdapterError(
          "not_configured",
          "email adapter connect: no smtpUser/mailboxAddress in config section",
        );
      }

      fromAddress = smtpUser;
      mailboxAddress = mailbox;
      connected = true;
    },

    async disconnect() {
      connected = false;
    },

    isConnected: () => connected,

    // §7: email is plaintext on the wire unless PGP is configured; the
    // PgpEncryption provider is the E2EE seam, not this flag.
    isEncrypted: () => false,

    capabilities: () => [],

    ownsTarget: (target,) => isEmailAddress(target,),

    async sendMessage(target, message,) {
      const transport = options.transport;
      if (!connected || fromAddress === undefined || transport === undefined) {
        throw new EmailAdapterError(
          "not_configured",
          `email adapter send to ${target}: ${
            !connected || fromAddress === undefined ? "not connected/configured" : "no transport"
          }`,
        );
      }

      const transportId = await transport.send({ from: fromAddress, to: target, body: message.body, },);
      return transportId === "" ? `<${randomUUID()}@${domainOf(fromAddress,)}>` : transportId;
    },

    onMessage(registered,) {
      handler = registered;
    },

    ingest(raw,) {
      const recipients = raw.to.map(senderAddress,);
      const mailbox = mailboxAddress !== undefined && recipients.includes(mailboxAddress,)
        ? mailboxAddress
        : recipients[0];

      const envelope: AdapterMessage = {
        id: raw.messageId ?? stableMessageId(raw,),
        author: senderAddress(raw.from,),
        target: mailbox ?? "",
        body: raw.subject === undefined ? raw.body : `${raw.subject}\n\n${raw.body}`,
        timestamp: raw.date ?? now(),
      };

      handler?.(envelope,);
      return envelope;
    },
  };

  return adapter;
}
