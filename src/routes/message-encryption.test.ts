/**
 * Tests for routes/message-encryption.ts — chat key endpoint
 */

import { describe, expect, test, } from "bun:test";

// Note: This file tests the message-encryption route which provides
// the chat encryption key endpoint. The route is simple and mostly
// delegates to crypto functions.

describe("message-encryption route", () => {
  test("route module exports expected functions", async () => {
    // Dynamic import to avoid side effects
    const mod = await import("./message-encryption");
    expect(typeof mod.messageEncryptionRoutes,).toBe("function",);
  });
});
