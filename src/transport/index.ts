// src/transport/index.ts — Barrel exports

// ── Core ─────────────────────────────────────────────────
export type { ProtocolHandler, Connection, ProtocolEvents } from "./protocol.unified";
export { TransportError, TransportErrorCode } from "./errors";

// ── Enums (re-exported from db/enums) ───────────────────
export { TransportProtocol, CompressionAlgorithm } from "../db/enums";

// ── Factory ──────────────────────────────────────────────
export { createProtocol } from "./factory";
export type { TransportConfig } from "./factory";

// ── Adapters ─────────────────────────────────────────────
export { createHttp1Handler, Http1Handler } from "./http1";
export { createH2Handler, H2Handler } from "./h2";
export { createWsHandler, WsHandler } from "./ws";

// ── Compression ──────────────────────────────────────────
export { withCompression, compress, decompress } from "./compression";
export type { CompressionOptions } from "./compression";

// ── Negotiation ──────────────────────────────────────────
export { negotiate, DEFAULT_CAPABILITIES } from "./negotiation";
export type { ServerCapabilities, NegotiationResult } from "./negotiation";
export { parseAcceptProtocols, parseAcceptEncoding, parseExtensions } from "./negotiation-parsers";

// ── Upgrade ──────────────────────────────────────────────
export { upgradeConnection } from "./upgrade";

// ── Testing ──────────────────────────────────────────────
export { validateProtocol, buildDefaultTests } from "./test/harness";
export type { TransportTestSuite, TestResult, TestReport } from "./test/harness";
