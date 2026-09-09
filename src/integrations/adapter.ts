// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/integrations/adapter.ts — THE external-protocol adapter seam.
//
// Decision (TASK-consolidate-chat-im-adapter-abstraction-above-protocolhandle):
// `ProtocolAdapter` here is the single message-level contract every bridge
// (Matrix, XMPP, IRC, Telegram, Discord, Signal, email) implements. The
// social-hub `SocialAdapter` sketch is retired as a competing root — its
// unique surface survives as optional capability interfaces below, exposed
// via `capabilities()` and narrowed by the bridge at runtime.
//
// Layering: `ProtocolHandler` (src/transport/protocol.unified.ts) is the byte
// transport; adapters sit above it and own protocol framing, auth, and
// encryption state. Transport-level fetch (e.g. federation gossip's
// `PeerFetch`) is NOT an adapter — it stays at the transport layer.

/** Minimal message envelope crossing a bridge. Protocols extend it. */
export interface AdapterMessage {
  /** Protocol-side message id (opaque to the core). */
  id: string;
  /** Protocol-side author id (opaque to the core). */
  author: string;
  /** Target channel/room/user id (opaque to the core). */
  target: string;
  /** Plain-text body; attachments ride protocol extensions. */
  body: string;
  /** Send timestamp (ms since epoch). */
  timestamp: number;
}

/** Inbound message handler registered via `onMessage`. */
export type AdapterMessageHandler = (message: AdapterMessage,) => void;

/** Capability ids a ProtocolAdapter may advertise. */
export const ADAPTER_CAPABILITIES = [
  "channels",
  "presence",
  "reactions",
  "message-edit",
  "auth-challenge",
  "auth-approval",
] as const;

/** Capability id type. */
export type AdapterCapability = (typeof ADAPTER_CAPABILITIES)[number];

/**
 * The external-protocol adapter contract. All bridges implement this;
 * richer protocol surface is capability-gated (see below), never a second
 * root interface.
 */
export interface ProtocolAdapter {
  /** Adapter name (e.g. "matrix"). */
  readonly name: string;
  /** Protocol id (e.g. "matrix", "xmpp", "irc"). */
  readonly protocol: string;

  /** Connect with protocol-specific config. */
  connect(config: Record<string, unknown>,): Promise<void>;
  /** Graceful disconnect. */
  disconnect(): Promise<void>;
  /** True while connected. */
  isConnected(): boolean;
  /** True when transport content is end-to-end encrypted. */
  isEncrypted(): boolean;
  /** Capability ids this adapter implements (subset of ADAPTER_CAPABILITIES). */
  capabilities(): AdapterCapability[];

  /** Send a message; resolves with the protocol-side message id. */
  sendMessage(target: string, message: Omit<AdapterMessage, "id" | "target">,): Promise<string>;
  /** Register the inbound message handler (replaces any previous). */
  onMessage(handler: AdapterMessageHandler,): void;
}

/** Channel directory (ex-SocialAdapter channels/users surface). */
export interface ChannelCapable {
  /** Capability id: "channels". */
  readonly capability: "channels";
  /** List visible channels/rooms. */
  listChannels(): Promise<{ id: string; name: string }[]>;
}

/** Presence source (ex-SocialAdapter presence surface). */
export interface PresenceCapable {
  /** Capability id: "presence". */
  readonly capability: "presence";
  /** Register the presence handler (replaces any previous). */
  onPresence(handler: (user: string, state: string,) => void,): void;
}

/** Reaction source (ex-SocialAdapter reactions surface). */
export interface ReactionCapable {
  /** Capability id: "reactions". */
  readonly capability: "reactions";
  /** Register the reaction handler (replaces any previous). */
  onReaction(handler: (target: string, emoji: string,) => void,): void;
}

/** Message editor (ex-SocialAdapter edit/delete surface). */
export interface MessageEditCapable {
  /** Capability id: "message-edit". */
  readonly capability: "message-edit";
  /** Edit own message. */
  editMessage(target: string, messageId: string, body: string,): Promise<void>;
  /** Delete own message. */
  deleteMessage(target: string, messageId: string,): Promise<void>;
}
