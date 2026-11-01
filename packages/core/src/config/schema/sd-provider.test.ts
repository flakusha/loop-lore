// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * SD provider ordering — the fallback list image generation walks
 * (BUG-image-audio-providers-no-byo-key-or-failover).
 *
 * The order is the contract: an exact-purpose provider must win over a
 * `both` one, a `both` one over an unrelated provider, and config order
 * decides inside each tier.
 *
 * RESOURCE CONTRACT (parallel-safe): pure ordering over in-memory configs —
 * no DB, no port, no file, no module-level mutable state.
 */
import { describe, expect, test, } from "bun:test";
import type { ImageProviderConfig, } from "./providers";
import { listSdProviders, pickSdProvider, } from "./sd-provider";

function provider(
  name: string,
  purpose?: ImageProviderConfig["purpose"],
): ImageProviderConfig {
  return {
    name,
    label: name,
    baseUrl: "http://127.0.0.1:8188",
    apiFamily: "sdcpp",
    ...(purpose ? { purpose, } : {}),
    defaults: { width: 64, height: 64, steps: 1, cfgScale: 1, sampler: "euler", },
    timeout: 1_000,
    generationTimeout: 1_000,
  };
}

const names = (providers: ImageProviderConfig[],): string[] => providers.map((p,) => p.name);

describe("listSdProviders", () => {
  test("returns an empty list when nothing is configured", () => {
    expect(listSdProviders(undefined, "generate",),).toEqual([],);
    expect(listSdProviders([], "edit",),).toEqual([],);
  });

  test("orders exact purpose, then both/unset, then the rest", () => {
    const list = [
      provider("unrelated", "edit",),
      provider("both", "both",),
      provider("exact", "generate",),
      provider("unset",),
    ];

    expect(names(listSdProviders(list, "generate",),),).toEqual([
      "exact",
      "both",
      "unset",
      "unrelated",
    ],);
  });

  test("keeps config order inside each tier and never repeats a provider", () => {
    const list = [
      provider("exact-a", "generate",),
      provider("edit-only", "edit",),
      provider("exact-b", "generate",),
      provider("both-a", "both",),
    ];

    const ordered = listSdProviders(list, "generate",);

    expect(names(ordered,),).toEqual(["exact-a", "exact-b", "both-a", "edit-only",],);
    expect(new Set(ordered,).size,).toBe(ordered.length,);
  });

  test("an edit request reverses the exact tier but keeps the tail stable", () => {
    const list = [provider("gen-only", "generate",), provider("edit-a", "edit",), provider("unset",),];

    expect(names(listSdProviders(list, "edit",),),).toEqual(["edit-a", "unset", "gen-only",],);
  });

  test("pickSdProvider is the head of the ordered list", () => {
    const list = [provider("edit-only", "edit",), provider("both", "both",),];

    expect(pickSdProvider(list, "generate",),).toBe(listSdProviders(list, "generate",)[0],);
    expect(pickSdProvider(list, "generate",)?.name,).toBe("both",);
    expect(pickSdProvider(undefined, "generate",),).toBeUndefined();
  });
});
