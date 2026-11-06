// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { fetchProviderList, } from "./provider-list";

type ApiFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;
const g = globalThis as unknown as { apiFetch?: ApiFetchMock };

const originalFetch = g.apiFetch;
let handler: ApiFetchMock = async () => Response.json({},);

beforeEach(() => {
  handler = async () => Response.json({},);
  g.apiFetch = (url, opts,) => handler(url, opts,);
},);

afterEach(() => {
  g.apiFetch = originalFetch;
},);

describe("fetchProviderList", () => {
  test("returns the listed providers", async () => {
    handler = async () =>
      Response.json({
        providers: [{ name: "openai", label: "OpenAI", status: "healthy", },],
      },);

    const outcome = await fetchProviderList();
    expect(outcome.providers,).toEqual([{ name: "openai", label: "OpenAI", status: "healthy", },],);
    expect(outcome.forbidden,).toBe(false,);
    expect(outcome.failed,).toBe(false,);
    expect(outcome.notice,).toBe("",);
  });

  test("treats a 403 as the admin-only refusal, not a failure", async () => {
    handler = async () => new Response("forbidden", { status: 403, },);

    const outcome = await fetchProviderList();
    expect(outcome.forbidden,).toBe(true,);
    expect(outcome.failed,).toBe(false,);
    expect(outcome.providers,).toEqual([],);
    expect(outcome.notice,).toBe("common.providerListAdminOnly",);
  });

  test("treats a server error as a failure", async () => {
    handler = async () => new Response("boom", { status: 500, },);

    const outcome = await fetchProviderList();
    expect(outcome.forbidden,).toBe(false,);
    expect(outcome.failed,).toBe(true,);
    expect(outcome.notice,).toBe("common.providerListUnavailable",);
  });

  test("treats a network error as a failure", async () => {
    handler = async () => {
      throw new Error("offline",);
    };

    const outcome = await fetchProviderList();
    expect(outcome.failed,).toBe(true,);
    expect(outcome.notice,).toBe("common.providerListUnavailable",);
  });

  test("tolerates a response without a providers array", async () => {
    handler = async () => Response.json({ providers: null, },);

    const outcome = await fetchProviderList();
    expect(outcome.providers,).toEqual([],);
    expect(outcome.notice,).toBe("",);
  });
});
