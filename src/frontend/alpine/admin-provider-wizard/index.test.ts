// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { createProviderWizard, } from "./index";

type FetchMock = (url: string, options?: RequestInit,) => Promise<Response>;

const globalState = globalThis as unknown as {
  apiFetch?: FetchMock;
  showToast?: (type: "success" | "error", message: string,) => void;
};

let posts: Array<{ url: string; body: Record<string, unknown> }> = [];
let toasts: Array<{ type: string; message: string }> = [];

/** Build a JSON response for the mocked apiFetch. */
function jsonResponse(body: unknown, status = 200,): Response {
  return new Response(JSON.stringify(body,), {
    status,
    headers: { "Content-Type": "application/json", },
  },);
}

/** The saved provider descriptor used by the mocked backend. */
const savedProvider = {
  name: "openai",
  label: "OpenAI",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  allowedHosts: ["api.openai.com",],
  hasApiKey: true,
};

beforeEach(() => {
  posts = [];
  toasts = [];
  globalState.showToast = (type: string, message: string,) => {
    toasts.push({ type, message, },);
  };
},);

afterEach(() => {
  globalState.apiFetch = undefined;
  globalState.showToast = undefined;
},);

describe("provider connection wizard", () => {
  test("save posts the provider body and clears the api key", async () => {
    globalState.apiFetch = async (url: string, options?: RequestInit,) => {
      if (options?.method === "POST") {
        posts.push({ url, body: JSON.parse(String(options.body,),), },);
        return jsonResponse({ ok: true, provider: savedProvider, },);
      }

      return jsonResponse({ providers: [], },);
    };

    const wizard = createProviderWizard();
    wizard.wizard.baseUrl = "https://api.openai.com/v1";
    wizard.wizard.model = "gpt-4o-mini";
    wizard.wizard.apiKey = "sk-secret";

    await wizard.saveProvider();

    expect(posts[0]?.url,).toBe("/api/v1/admin/setup/providers",);
    expect(posts[0]?.body,).toEqual({
      name: "api.openai.com",
      label: "api.openai.com",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      setDefault: false,
      apiKey: "sk-secret",
    },);

    expect(wizard.wizard.apiKey,).toBe("",);
    expect(wizard.wizard.step,).toBe(2,);
    expect(wizard.wizard.savedName,).toBe("openai",);
  });

  test("a rejected save shows the server message and keeps no stale success state", async () => {
    globalState.apiFetch = async (_url: string, options?: RequestInit,) => {
      if (options?.method === "POST") { return jsonResponse({ message: "Invalid provider payload", }, 400,); }
      return jsonResponse({ providers: [], },);
    };

    const wizard = createProviderWizard();
    wizard.wizard.baseUrl = "https://api.openai.com/v1";
    wizard.wizard.model = "gpt-4o-mini";
    wizard.wizard.apiKey = "sk-secret";

    await wizard.saveProvider();

    expect(wizard.wizard.error,).toBe("Invalid provider payload",);
    expect(wizard.wizard.step,).toBe(1,);
    expect(wizard.wizard.savedName,).toBe("",);
    expect(wizard.wizard.apiKey,).toBe("sk-secret",);
    expect(toasts.filter((toast,) => toast.type === "error"),).toHaveLength(0,);
  });

  test("the test step reads the rescan summary of the saved provider", async () => {
    globalState.apiFetch = async (url: string,) => {
      if (url === "/api/v1/admin/providers/rescan") {
        return jsonResponse({
          providers: [
            { name: "other", label: "Other", status: "healthy", modelCount: 3, },
            {
              name: "openai",
              label: "OpenAI",
              status: "unreachable",
              modelCount: 0,
              error: "connection refused",
            },
          ],
        },);
      }

      return jsonResponse({ providers: [], },);
    };

    const wizard = createProviderWizard();
    wizard.wizard.savedName = "openai";

    await wizard.testConnection();

    expect(wizard.wizard.testStatus,).toBe("unreachable",);
    expect(wizard.wizard.testError,).toBe("connection refused",);
  });

  test("a stored api key is kept when the field is left empty", async () => {
    globalState.apiFetch = async (url: string, options?: RequestInit,) => {
      if (options?.method === "POST") {
        posts.push({ url, body: JSON.parse(String(options.body,),), },);
        return jsonResponse({ ok: true, provider: savedProvider, },);
      }

      return jsonResponse({ providers: [savedProvider,], },);
    };

    const wizard = createProviderWizard();
    await wizard.loadProviders();

    wizard.editProvider("openai",);
    expect(wizard.wizard.hasStoredKey,).toBe(true,);
    expect(wizard.wizard.apiKey,).toBe("",);

    await wizard.saveProvider();

    expect(posts[0]?.body.apiKey,).toBeUndefined();
    expect(posts[0]?.body.name,).toBe("openai",);
  });

  test("a failing setup-state fetch leaves the wizard usable", async () => {
    globalState.apiFetch = async (url: string,) => {
      if (url === "/api/v1/setup/state") { throw new Error("network down",); }
      return jsonResponse({ providers: [], },);
    };

    const wizard = createProviderWizard();
    wizard.openProviderWizard();

    await wizard.loadSetupState();

    expect(wizard.wizard.setupHints,).toEqual([],);
    expect(wizard.wizard.open,).toBe(true,);
    expect(toasts,).toHaveLength(0,);
  });
});
