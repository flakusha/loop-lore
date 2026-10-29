// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ModelsOverlay (pi-tui): the three-level drill-down (roles → providers →
 * models), the c/r/p action keys and the failure/403 path — driven through
 * the models-api setFetch seam. Pure component.
 */
import { afterEach, describe, expect, it, } from "bun:test";
import { safeFetch, } from "../utils";
import type { FetchResult, SafeFetchOptions, } from "../utils/safe-fetch/types";
import { setFetch, } from "./models-api";
import type { ProviderSummary, ResolvedRole, } from "./models-api";
import { ModelsOverlay, } from "./models-overlay";
import { stripRows, tick, } from "./test-support";

interface Recorded {
  url: string;
  options: SafeFetchOptions;
}

const calls: Recorded[] = [];
const realFetch = safeFetch;

const ROLES: ResolvedRole[] = [
  { role: "main", provider: "openai", model: "gpt-x", source: "db", },
  { role: "aux", provider: "", model: "", source: "default", },
];

const PROVIDERS: ProviderSummary[] = [
  { name: "openai", label: "OpenAI", status: "healthy", modelCount: 2, },
  { name: "ollama", label: "Ollama", status: "unreachable", modelCount: 0, error: "conn refused", },
];

function ok<T,>(data: T,): Promise<FetchResult<T>> {
  return Promise.resolve({ ok: true, data, status: 200, headers: new Headers(), },);
}

function route(): void {
  setFetch(<T,>(url: string, options?: SafeFetchOptions,): Promise<FetchResult<T>> => {
    calls.push({ url, options: options ?? {}, },);
    if (url.endsWith("/admin/model-roles",)) {
      return ok({ roles: ROLES, overrides: {}, validRoles: ["main", "aux",], } as T,);
    }

    if (url.endsWith("/rescan",)) {
      return ok({ providers: PROVIDERS, } as T,);
    }

    if (url.endsWith("/admin/providers",)) {
      return ok({ providers: PROVIDERS, } as T,);
    }

    if (url.includes("/models",)) {
      return ok({ name: "openai", label: "OpenAI", models: [{ id: "gpt-x", }, { id: "mini", },], } as T,);
    }

    if (url.endsWith("/test-connection",)) {
      return ok({ ok: true, status: "reachable", latencyMs: 12, } as T,);
    }

    return ok(true as T,);
  },);
}

afterEach(() => {
  calls.length = 0;
  setFetch(realFetch,);
},);

function build(): ModelsOverlay {
  return new ModelsOverlay({ sessionToken: "tok", getViewportRows: () => 24, },);
}

describe("ModelsOverlay", () => {
  it("shows roles with their source tag on open", async () => {
    route();
    const overlay = build();
    overlay.show();
    await tick(2,);

    const rows = stripRows(overlay.render(70,),).join("\n",);
    expect(rows,).toContain("main",);
    expect(rows,).toContain("gpt-x",);
    expect(rows,).toContain("[db]",);
    expect(rows,).toContain("aux",);
    expect(rows,).toContain("[default]",);
    expect(rows,).toContain("Up/Down: move | Enter: pick provider",);
    expect(overlay.isVisible(),).toBe(true,);
  });

  it("Enter drills providers, then models, then assigns and returns to roles", async () => {
    route();
    const overlay = build();
    overlay.show();
    await tick(2,);

    overlay.handleInput("\r",); // roles -> providers
    await tick(2,);
    expect(stripRows(overlay.render(70,),).join("\n",),).toContain("healthy",);

    overlay.handleInput("\r",); // providers -> models
    await tick(2,);
    const modelRows = stripRows(overlay.render(70,),).join("\n",);
    expect(modelRows,).toContain("gpt-x",);
    expect(modelRows,).toContain("mini",);

    overlay.handleInput("\r",); // models -> assign
    await tick(2,);
    await tick();
    expect(calls.some((call,) => call.options.method === "PUT"),).toBe(true,);
    expect(stripRows(overlay.render(70,),).join("\n",),).toContain("main -> openai / gpt-x",);
  });

  it("arrows move the cursor before Enter", async () => {
    route();
    const overlay = build();
    overlay.show();
    await tick(2,);

    overlay.handleInput("\x1b[B",);
    expect(stripRows(overlay.render(70,),).join("\n",),).toContain("> aux",);
  });

  it("`c` clears the focused role's override", async () => {
    route();
    const overlay = build();
    overlay.show();
    await tick(2,);

    overlay.handleInput("c",);
    await tick(2,);
    expect(calls.some((call,) => call.options.method === "DELETE"),).toBe(true,);
    expect(stripRows(overlay.render(70,),).join("\n",),).toContain("main override cleared",);
  });

  it("`r` rescans providers", async () => {
    route();
    const overlay = build();
    overlay.show();
    await tick(2,);

    overlay.handleInput("r",);
    await tick(2,);
    expect(calls.some((call,) => call.url.endsWith("/rescan",)),).toBe(true,);
    expect(stripRows(overlay.render(70,),).join("\n",),).toContain("providers rescanned",);
  });

  it("`p` on the providers level pings the focused provider", async () => {
    route();
    const overlay = build();
    overlay.show();
    await tick(2,);

    overlay.handleInput("\r",); // to providers
    await tick(2,);
    overlay.handleInput("p",);
    await tick(2,);
    expect(calls.some((call,) => call.url.endsWith("/test-connection",)),).toBe(true,);
    expect(stripRows(overlay.render(70,),).join("\n",),).toContain("reachable 12ms",);
  });

  it("`p` elsewhere explains itself", async () => {
    route();
    const overlay = build();
    overlay.show();
    await tick(2,);

    overlay.handleInput("p",);
    await tick();
    expect(stripRows(overlay.render(70,),).join("\n",),).toContain("press p on a provider row",);
  });

  it("a failed load renders the error in place of the rows", async () => {
    setFetch(<T,>(_url: string, _options?: SafeFetchOptions,): Promise<FetchResult<T>> =>
      Promise.resolve({ ok: false, error: new Error("admin only",), status: 403, headers: new Headers(), },)
    );

    const overlay = build();
    overlay.show();
    await tick(2,);

    expect(stripRows(overlay.render(70,),).join("\n",),).toContain("admin only",);
  });

  it("dismiss closes an open overlay and reports it", async () => {
    route();
    const overlay = build();
    expect(overlay.dismiss(),).toBe(false,);
    overlay.show();
    await tick();
    expect(overlay.dismiss(),).toBe(true,);
    expect(overlay.isVisible(),).toBe(false,);
  });

  it("handles no keys while hidden", async () => {
    route();
    const overlay = build();
    overlay.handleInput("c",);
    await tick();
    expect(calls,).toEqual([],);
  });
});
