/**
 * DB Schema Enums — Configuration & Policy
 *
 * App configuration, logging, age gate, game master,
 * content moderation policies.
 */

// ── Config ────────────────────────────────────────────────
export const DbType = {
  Sqlite: "sqlite",
  Postgres: "postgres",
} as const;
export type DbType = (typeof DbType)[keyof typeof DbType];

export const LogLevel = {
  Debug: "debug",
  Info: "info",
  Warn: "warn",
  Error: "error",
} as const;
export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

export const AgeGateMode = {
  None: "none",
  SelfDeclaration: "self-declaration",
  Verification: "verification",
} as const;
export type AgeGateMode = (typeof AgeGateMode)[keyof typeof AgeGateMode];

// ── Game Master ───────────────────────────────────────────
export const GameMasterType = {
  Llm: "llm",
  Human: "human",
  Hybrid: "hybrid",
} as const;
export type GameMasterType = (typeof GameMasterType)[keyof typeof GameMasterType];

// ── Policy / Content Moderation ───────────────────────────
export const PolicyType = {
  Sfw: "sfw",
  Nsfw: "nsfw",
  Custom: "custom",
} as const;
export type PolicyType = (typeof PolicyType)[keyof typeof PolicyType];

export const PolicyIndicatorType = {
  Keyword: "keyword",
  Pattern: "pattern",
  Semantic: "semantic",
  Context: "context",
} as const;
export type PolicyIndicatorType = (typeof PolicyIndicatorType)[keyof typeof PolicyIndicatorType];

export const PolicySeverity = {
  Low: "low",
  Medium: "medium",
  High: "high",
} as const;
export type PolicySeverity = (typeof PolicySeverity)[keyof typeof PolicySeverity];

// ── Transport ───────────────────────────────────────────
export const TransportProtocol = {
  Http1_1: "http/1.1",
  Http2: "http/2",
  Http3: "http/3",
  WebSocket: "websocket",
  WebTransport: "webtransport",
  Tcp: "tcp",
  Tls: "tls",
} as const;
export type TransportProtocol = (typeof TransportProtocol)[keyof typeof TransportProtocol];

export const CompressionAlgorithm = {
  Zstd: "zstd",
  Brotli: "br",
  Gzip: "gzip",
  None: "none",
} as const;
export type CompressionAlgorithm = (typeof CompressionAlgorithm)[keyof typeof CompressionAlgorithm];

export const TransportErrorCode = {
  ProtocolUnsupported: "PROTOCOL_UNSUPPORTED",
  NegotiationFailed: "NEGOTIATION_FAILED",
  CompressionFailed: "COMPRESSION_FAILED",
  UpgradeFailed: "UPGRADE_FAILED",
  ConnectionClosed: "CONNECTION_CLOSED",
  BackpressureTimeout: "BACKPRESSURE_TIMEOUT",
  MaxFrameExceeded: "MAX_FRAME_EXCEEDED",
} as const;
export type TransportErrorCode = (typeof TransportErrorCode)[keyof typeof TransportErrorCode];
