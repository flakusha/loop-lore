// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * E2E: honkbox HTTP boundary.
 *
 * Presence always probes {HONKBOX_BASE_URL}/capabilities and skips cleanly when
 * the service is not installed/running yet. Live chat dispatch is opt-in behind
 * E2E_HONKBOX_LIVE=1 and a configured E2E_HONKBOX_MODEL. Capabilities are
 * probed through the same helper production uses — never assumed.
 */
import { afterAll, describe, expect, test, } from "bun:test";
import { unregisterProvider, } from "../../../src/generation/providers/registry";
import {
  clearHonkboxCapabilitiesCache,
  getHonkboxCapabilities,
  HONKBOX_SUPPORTED_API_MAJOR,
  type HonkboxProbeResult,
  isHonkboxExternalToolAvailable,
  runHonkboxChatTurn,
  setupHonkboxCustomProvider,
} from "../../../src/integrations/honkbox";

const BASE = process.env.HONKBOX_BASE_URL ?? "http://127.0.0.1:9010/v1";
const API_KEY = process.env.HONKBOX_API_KEY;
const MODEL = process.env.E2E_HONKBOX_MODEL ?? "";
const LIVE = process.env.E2E_HONKBOX_LIVE === "1";
const PROVIDER = "e2e-honkbox";

afterAll(() => {
  unregisterProvider(PROVIDER,);
  clearHonkboxCapabilitiesCache();
},);

/** Fresh probe of the configured instance. */
async function probe(): Promise<HonkboxProbeResult> {
  clearHonkboxCapabilitiesCache();
  return await getHonkboxCapabilities({
    baseUrl: BASE,
    ...(API_KEY ? { apiKey: API_KEY, } : {}),
    timeoutMs: 3_000,
    refresh: true,
  },);
}

describe("local honkbox boundary", () => {
  test("presence: capabilities describe a supported live contract", async () => {
    const result = await probe();
    if (!result.ok) { return; }
    expect(result.supported,).toBe(true,);
    expect(result.capabilities.apiVersion,).toContain(`v${HONKBOX_SUPPORTED_API_MAJOR}`,);
    expect(result.capabilities.server.name.length,).toBeGreaterThan(0,);

    const tools = result.capabilities.externalTools?.tools ?? [];
    const advertised = tools.find((tool,) => tool.available && tool.capabilities.length > 0);
    if (!advertised) { return; }
    expect(isHonkboxExternalToolAvailable(
      result,
      advertised.id,
      advertised.capabilities[0],
    ),).toBe(true,);
  });

  test("live: one capability-gated chat turn through the Custom provider", async () => {
    if (!LIVE || !MODEL) { return; }
    const presence = await probe();
    if (!presence.ok || !presence.supported) { return; }

    const setup = await setupHonkboxCustomProvider({
      name: PROVIDER,
      baseUrl: BASE,
      model: MODEL,
      ...(API_KEY ? { apiKey: API_KEY, } : {}),
    },);

    const response = await runHonkboxChatTurn({
      config: setup.config,
      probe: setup.probe,
      localAdmission: false,
    }, {
      model: MODEL,
      messages: [{ role: "user", content: "Reply with exactly: honk-ok", },],
      params: { temperature: 0, maxTokens: 256, },
    },);

    expect((response.content + (response.thinking ?? "")).trim().length,).toBeGreaterThan(0,);
  }, 120_000,);
});
