// src/transport/index.ts — Barrel exports

// ── Core ─────────────────────────────────────────────────
export { TransportError, TransportErrorCode, } from "./errors";
export type { Connection, ProtocolEvents, ProtocolHandler, } from "./protocol.unified";

// ── Enums (re-exported from db/enums) ───────────────────
export { CompressionAlgorithm, TransportProtocol, } from "../db/enums";

// ── Factory ──────────────────────────────────────────────
export { createProtocol, } from "./factory";
export type { TransportConfig, } from "./factory";

// ── Adapters ─────────────────────────────────────────────
export { createH2Handler, H2Handler, } from "./h2";
export { createHttp1Handler, Http1Handler, } from "./http1";
export { createWsHandler, WsHandler, } from "./ws";

// ── Compression ──────────────────────────────────────────
export { compress, decompress, withCompression, } from "./compression";
export type { CompressionOptions, WithCompressionOpts, } from "./compression";

// ── Negotiation ──────────────────────────────────────────
export { DEFAULT_CAPABILITIES, negotiate, } from "./negotiation";
export type { NegotiationResult, ServerCapabilities, } from "./negotiation";
export { parseAcceptEncoding, parseAcceptProtocols, parseExtensions, } from "./negotiation-parsers";

// ── Upgrade ──────────────────────────────────────────────
export { upgradeConnection, } from "./upgrade";
export type { UpgradeConnectionOpts, } from "./upgrade";

// ── Testing ──────────────────────────────────────────────
export { buildDefaultTests, validateProtocol, } from "./test/harness";
export type { TestReport, TestResult, TransportTestSuite, } from "./test/harness";
