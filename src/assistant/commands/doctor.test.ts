// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Tests for /doctor — the read-only setup-state renderer.
//
// SECRET RULE (load-bearing): output carries check ids + ok/off + static
// next steps only. These tests fail if a raw `hint` (provider errors and
// thrown messages can carry paths) or any secret value ever reaches output.
import { describe, expect, test, } from "bun:test";
import type { Config, } from "../../config/schema";
import type { SetupCheck, } from "../../routes/setup/checks";
import { evaluateCapabilities, } from "../guard/matrix";
import { renderDoctorReport, } from "./doctor";
import { getCommand, getCommandCapabilities, } from "./registry";

/** The six stable setup check ids, in contract order. */
const STABLE_IDS = ["env.pii", "provider.health", "smk", "model.roles", "native", "tls",];

/** Minimal config: no generation section, no TLS paths, no PII secrets. */
function testConfig(): Config {
  return {
    server: { tls: { key: "/nonexistent/doctor/key.pem", cert: "/nonexistent/doctor/cert.pem", }, },
  } as unknown as Config;
}

/** Resolve the registered handler, failing loudly when registration broke. */
function mustGet() {
  const handler = getCommand("doctor",);
  if (!handler) { throw new Error("command not registered: /doctor",); }
  return handler;
}

describe("/doctor", () => {
  test("lists all six stable setup checks in order", async () => {
    const result = await mustGet()([], { chatId: "chat-1", config: testConfig(), },);
    expect(result.handled,).toBe(true,);
    const message = result.systemMessage ?? "";
    for (const id of STABLE_IDS) {
      expect(message,).toContain(`\`${id}\``,);
    }

    expect(message,).toContain("of 6 setup checks passing",);
  });

  test("marks off checks with next-step guidance", () => {
    const checks: SetupCheck[] = STABLE_IDS.map((id,) => ({ id, ok: false, hint: "suppressed", }));
    const message = renderDoctorReport(checks,);
    expect(message,).toContain("**Doctor:** 0 of 6 setup checks passing.",);
    for (const id of STABLE_IDS) {
      expect(message,).toContain(`\`${id}\` — off — `,);
    }

    expect(message,).toContain("admin provider settings",);
    expect(message,).toContain("SERVER_ENCRYPTION_KEY",);
  });

  test("output never carries hint paths or secret values", () => {
    const sentinel = "SENTINEL_hunter2_pii_value";
    const secretPath = "/etc/loop-lore/SENTINEL_secret_key.pem";
    const checks: SetupCheck[] = [
      { id: "provider.health", ok: false, hint: `No healthy provider — down: ${secretPath}`, },
      { id: "env.pii", ok: false, hint: `NSFW_PII_SECRET=${sentinel}`, },
      { id: "smk", ok: true, },
      { id: "model.roles", ok: true, },
      { id: "native", ok: true, },
      { id: "tls", ok: false, hint: `key missing: ${secretPath}`, },
    ];

    const message = renderDoctorReport(checks,);
    expect(message,).not.toContain(sentinel,);
    expect(message,).not.toContain(secretPath,);
    expect(message,).not.toContain("suppressed",);
    expect(message,).toContain("**Doctor:** 3 of 6 setup checks passing.",);
  });

  test("guard passes fail-closed on the declared read-chat capability", () => {
    const tags = getCommandCapabilities("doctor",)?.tags;
    expect(tags,).toContain("read-chat",);
    const decision = evaluateCapabilities({ tool: "doctor", tags, roleInChat: undefined, userRole: null, },);
    expect(decision.allowed,).toBe(true,);
    expect(decision.requiresReview,).toBe(false,);
  });

  test("reports unavailable when command context carries no config", async () => {
    const result = await mustGet()([], { chatId: "chat-1", },);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("**Doctor unavailable:**",);
  });
});
