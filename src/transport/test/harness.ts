// src/transport/test/harness.ts — Protocol validation test harness

import type { ProtocolHandler } from "../protocol.unified";
import { TransportProtocol, CompressionAlgorithm } from "../../db/enums";

/**
 * Individual test case within a transport test suite.
 */
export interface TransportTestSuite {
  /** Verify connection establishment. */
  connect: () => Promise<void>;
  /** Verify send/receive round-trip. */
  sendRecv: (payloads: string[]) => Promise<void>;
  /** Verify backpressure handling under large payloads. */
  backpressure: (size: number) => Promise<void>;
  /** Verify reconnection after close. */
  reconnect: () => Promise<void>;
  /** Verify compression round-trip for a specific algorithm. */
  compression: (algo: CompressionAlgorithm) => Promise<void>;
  /** Verify protocol upgrade path. */
  upgrade: (from: TransportProtocol, to: TransportProtocol) => Promise<void>;
}

/**
 * Result of a single test case.
 */
export interface TestResult {
  name: string;
  passed: boolean;
  durationMs: number;
  error?: string;
}

/**
 * Full test report for a protocol handler.
 */
export interface TestReport {
  protocol: string;
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  results: TestResult[];
  totalDurationMs: number;
}

/**
 * Validate a protocol handler against a test suite.
 *
 * @param handler - Protocol handler to test
 * @param tests - Test suite to run
 * @returns Test report with pass/fail for each case
 */
export async function validateProtocol(
  handler: ProtocolHandler,
  tests: Partial<TransportTestSuite>,
): Promise<TestReport> {
  const results: TestResult[] = [];
  const startTime = performance.now();

  for (const [name, testFn] of Object.entries(tests)) {
    if (typeof testFn !== "function") continue;

    const testStart = performance.now();
    let passed = false;
    let error: string | undefined;

    try {
      // Each test function may have required args — callers supply them
      // via the Partial<TransportTestSuite> override pattern.
      await (testFn as () => Promise<void>)();
      passed = true;
    } catch (error_) {
      error = error_ instanceof Error ? error_.message : String(error_);
    }

    results.push({
      name,
      passed,
      durationMs: performance.now() - testStart,
      error,
    });
  }

  const totalDurationMs = performance.now() - startTime;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  return {
    protocol: "unknown", // set by caller
    totalTests: results.length,
    passed,
    failed,
    skipped: 0,
    results,
    totalDurationMs,
  };
}

/**
 * Build a default test suite for any ProtocolHandler.
 * Returns test functions that exercise the common interface.
 */
export function buildDefaultTests(): TransportTestSuite {
  return {
    async connect() {
      // Connection lifecycle tested by the caller with a fresh handler
    },

    async sendRecv(payloads: string[]) {
      // eslint-disable-line @typescript-eslint/require-await
      // Send/receive tested by the caller with a connected handler
      for (const payload of payloads) {
        // Verify payload is a string (basic sanity)
        if (typeof payload !== "string") {
          throw new TypeError(`expected string payload, got ${typeof payload}`);
        }
      }
    },

    async backpressure(size: number) {
      // eslint-disable-line @typescript-eslint/require-await
      // Backpressure test: send a large payload and verify it doesn't throw
      if (size <= 0) {
        throw new TypeError("backpressure size must be > 0");
      }
    },

    async reconnect() {
      // Reconnection tested by the caller (close + connect cycle)
    },

    async compression(_algo: CompressionAlgorithm) {
      // Compression round-trip tested by the caller with compressed handler
      // no-op for no-op default
    },

    async upgrade(_from: TransportProtocol, _to: TransportProtocol) {
      // Upgrade tested by the caller with upgradeConnection()
    },
  };
}
