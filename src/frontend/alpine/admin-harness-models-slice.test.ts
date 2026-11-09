// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * The Harness tab's discovered-models section: live rows, a static fallback
 * with its reason, a refusal that never reads as "nothing found", and a
 * malformed body that leaves the section alone.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { readFileSync, } from "node:fs";
import { join, } from "node:path";
import { harnessModels, MODELS_URL, } from "./admin-harness-models";
import { buildDiscoveredModelRows, } from "./admin-harness-rows";
import { type HarnessDiscoveredModel, } from "./admin-harness-schema";

import type { ApiFetchMock, } from "../tests/test-types";

const globalState = globalThis as unknown as {
  apiFetch?: ApiFetchMock;
  showToast?: (type: string, message: string,) => void;
};

const originalFetch = globalState.apiFetch;
const originalToast = globalState.showToast;
const localeHost = globalThis as unknown as { __localeStrings?: unknown };
const originalLocale = localeHost.__localeStrings;
let calls: string[] = [];
let handler: ApiFetchMock = async () => Response.json({ items: [], },);
let toasts: { type: string; message: string }[] = [];

// `t()` resolves against the server-injected catalog; seed it from the real
// en.json so a refusal renders a translated sentence rather than the raw key.
const EN = JSON.parse(
  readFileSync(join(import.meta.dir, "../../public/locales/en.json",), "utf8",),
) as Record<string, unknown>;

beforeEach(() => {
  calls = [];
  toasts = [];
  localeHost.__localeStrings = EN;
  handler = async () => Response.json({ items: [], },);
  globalState.apiFetch = (url,) => {
    calls.push(url,);
    return handler(url,);
  };

  globalState.showToast = (type, message,) => {
    toasts.push({ type, message, },);
  };
},);

afterEach(() => {
  globalState.apiFetch = originalFetch;
  globalState.showToast = originalToast;
  localeHost.__localeStrings = originalLocale;
},);

/** A live, harness-reported model. */
const LIVE_MODEL: HarnessDiscoveredModel = {
  profile: "claude",
  harness: "claude-code",
  model: "claude-opus-5",
  source: "harness",
  capabilities: {
    contextWindow: 200000,
    maxOutput: 64000,
    supportsTools: true,
    supportsVision: true,
    supportsThinking: false,
    modalities: ["text", "image",],
  },
};

/** A static fallback: the capability table knows nothing about it. */
const STATIC_MODEL: HarnessDiscoveredModel = {
  profile: "chatgpt",
  harness: "codex",
  model: "gpt-5-codex",
  source: "static",
  reason: "no live connection",
  capabilities: null,
};

/** Fresh copy of the slice state, so tests do not share mutations. */
function freshState() {
  return { ...harnessModels, };
}

describe("harnessModels.loadHarnessModels", () => {
  test("a live model renders with its capabilities", async () => {
    handler = async () => Response.json({ items: [LIVE_MODEL,], },);
    const state = freshState();
    await state.loadHarnessModels();

    expect(calls,).toEqual([MODELS_URL,],);
    expect(buildDiscoveredModelRows([LIVE_MODEL,],)[0]?.capabilities,).toBe("tools · vision",);
    expect(state.loadingHarnessModels,).toBe(false,);
    expect(state.harnessModelsError,).toBe("",);
    expect(state.harnessDiscoveredModels,).toHaveLength(1,);
    expect(state.harnessDiscoveredModels[0],).toEqual({
      profile: "claude",
      model: "claude-opus-5",
      source: "harness",
      reason: "\u2014",
      contextWindow: "200000",
      maxOutput: "64000",
      capabilities: "tools · vision",
      modalities: "text, image",
    },);

    expect(state.harnessDiscoveredModelsEmpty(),).toBe(false,);
  });

  test("a static model renders WITH its reason", async () => {
    handler = async () => Response.json({ items: [STATIC_MODEL,], },);
    const state = freshState();
    await state.loadHarnessModels();

    expect(state.harnessDiscoveredModels[0]?.reason,).toBe("no live connection",);
    expect(state.harnessDiscoveredModels[0]?.source,).toBe("static",);
  });

  test("an entry with no known capability renders the dash, never a blank cell", async () => {
    handler = async () => Response.json({ items: [STATIC_MODEL,], },);
    const state = freshState();
    await state.loadHarnessModels();

    const row = state.harnessDiscoveredModels[0];

    expect(row?.capabilities,).toBe("\u2014",);
    expect(row?.contextWindow,).toBe("\u2014",);
    expect(row?.maxOutput,).toBe("\u2014",);
    expect(row?.modalities,).toBe("\u2014",);
  });

  test("a refused request shows the refusal, not an empty-looking success", async () => {
    handler = async () => new Response("", { status: 403, },);
    const state = freshState();
    await state.loadHarnessModels();

    expect(state.harnessModelsError.toLowerCase(),).toContain("permission",);
    expect(state.harnessModelsError,).not.toContain("harness.errorForbidden",);
    expect(state.loadingHarnessModels,).toBe(false,);
  });

  test("a malformed body falls back to an empty list without throwing", async () => {
    handler = async () => Response.json({ items: "nope", },);
    const state = freshState();
    await state.loadHarnessModels();

    expect(state.harnessDiscoveredModels,).toEqual([],);
    expect(state.loadingHarnessModels,).toBe(false,);
    expect(toasts.filter((toast,) => toast.type === "error").length,).toBe(1,);
  });

  test("an empty listing renders the empty state", async () => {
    handler = async () => Response.json({ items: [], },);
    const state = freshState();
    await state.loadHarnessModels();

    expect(state.harnessDiscoveredModels,).toEqual([],);
    expect(state.harnessDiscoveredModelsEmpty(),).toBe(true,);
    expect(state.harnessModelsError,).toBe("",);
  });
});
