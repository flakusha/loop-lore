// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/integrations/index.ts — public API of the integrations seams.
// Adapter (message-level contract), MessageBridge, BridgeRegistry, and
// EncryptionProvider; concrete protocol implementations re-export nothing here.

export {
  ADAPTER_CAPABILITIES,
  type AdapterCapability,
  type AdapterMessage,
  type AdapterMessageHandler,
  type ChannelCapable,
  type MessageEditCapable,
  type PresenceCapable,
  type ProtocolAdapter,
  type ReactionCapable,
} from "./adapter";
export {
  type BridgeSendError,
  type BridgeSendResult,
  createMessageBridge,
  type MessageBridge,
  type MessageBridgeOptions,
  type ModerationGate,
  type ModerationVerdict,
} from "./bridge";
export {
  createPassthroughEncryptionProvider,
  type EncryptedMessage,
  type EncryptionProvider,
  type KeyPair,
  PASSTHROUGH_ALGORITHM,
} from "./encryption";
export {
  type AdapterFailureCode,
  type AdapterHealth,
  type AdapterHealthOptions,
  type AdapterHealthStatus,
  type AdapterHealthSummary,
  type AdapterRateLimiter,
  type AdapterRateLimiterOptions,
  type AdapterVerdict,
  classifyAdapterFailure,
  createAdapterHealth,
  createAdapterRateLimiter,
  type RateLimitConsumeResult,
  type RateLimitRule,
} from "./health";
export {
  type BridgeRegistry,
  createBridgeRegistry,
  type NegotiateResult,
  type RegisterError,
  type RegisterResult,
} from "./registry";
export {
  type CredentialKeySource,
  openCredential,
  redactCredentials,
  REDACTED_MARKER,
  resolveCredential,
  rewrapCredential,
  type RewrapCredentialOpts,
  sealCredential,
  SECRET_REF_PREFIX,
  type SecretEnvelopeCode,
  type SecretEnvelopeError,
} from "./secrets";
