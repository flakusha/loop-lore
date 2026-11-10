// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import "../i18n.test-helper";
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { createProviderWizard, } from "./index";

/** A request the wizard sent. */
interface FetchCall {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
}

/** The element double the toast renderer writes into. */
interface FakeEl {
  className: string;
  textContent: string;
  innerHTML: string;
  type: string;
  children: FakeEl[];
  parentNode: FakeEl | null;
  append(...els: FakeEl[]): void;
  setAttribute(): void;
  addEventListener(): void;
  remove(): void;
}

/** Build the element double the toast renderer writes into. */
function makeEl(): FakeEl {
  const el: FakeEl = {
    className: "",
    textContent: "",
    innerHTML: "",
    type: "",
    children: [],
    parentNode: null,
    append(...els: FakeEl[]) {
      for (const child of els) {
        child.parentNode = el;
        el.children.push(child,);
      }
    },
    setAttribute() {},
    addEventListener() {},
    remove() {
      const parent = el.parentNode;
      if (!parent) { return; }
      parent.children = parent.children.filter((child,) => child !== el);
      el.parentNode = null;
    },
  };

  return el;
}

/** Build a JSON response for the mocked backend. */
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
  state: "live",
};

let calls: FetchCall[] = [];
let handler: (url: string, init: RequestInit,) => Promise<Response> = async () => Response.json({},);
let toastContainer = makeEl();
const originalFetch = globalThis.fetch;
const originalDocument = globalThis.document;

beforeEach(() => {
  calls = [];
  toastContainer = makeEl();
  handler = async () => Response.json({},);
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit,) => {
    calls.push({
      url: String(url,),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? JSON.parse(init.body,) : null,
    },);

    return handler(String(url,), init ?? {},);
  }) as typeof fetch;

  (globalThis as { document: unknown }).document = {
    querySelector: (selector: string,) => (selector === "#toast-container" ? toastContainer : null),
    createElement: () => makeEl(),
    addEventListener: () => {},
    removeEventListener: () => {},
    cookie: "",
  };
},);

afterEach(() => {
  globalThis.fetch = originalFetch;
  (globalThis as { document: unknown }).document = originalDocument;
},);

/** The toasts the real showToast rendered into the fake container. */
function renderedToasts(): { type: string; message: string }[] {
  return toastContainer.children.map((toast,) => ({
    type: (toast.className.match(/toast\s+(\S+)/u,) ?? [])[1] ?? "",
    message: toast.children[1]?.textContent ?? "",
  }));
}

describe("provider connection wizard", () => {
  test("save posts the provider body and clears the api key", async () => {
    handler = async (_url: string, init: RequestInit,) => {
      if (init.method === "POST") { return jsonResponse({ ok: true, provider: savedProvider, },); }
      return jsonResponse({ providers: [], },);
    };

    const wizard = createProviderWizard();
    wizard.wizard.baseUrl = "https://api.openai.com/v1";
    wizard.wizard.model = "gpt-4o-mini";
    wizard.wizard.apiKey = "sk-secret";

    await wizard.saveProvider();

    expect(calls[0]?.url,).toBe("/api/v1/admin/setup/providers",);
    expect(calls[0]?.body,).toEqual({
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
    handler = async (_url: string, init: RequestInit,) => {
      if (init.method === "POST") {
        return jsonResponse({ error: "Invalid provider payload", code: "VALIDATION_ERROR", }, 400,);
      }

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
    expect(renderedToasts().filter((toast,) => toast.type === "error"),).toHaveLength(0,);
  });

  test("the test step reads the rescan summary of the saved provider", async () => {
    handler = async (url: string,) => {
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

  test("the test step re-reads the setup state so the provider hint clears", async () => {
    let providerHealthy = false;
    handler = async (url: string,) => {
      if (url === "/api/v1/admin/providers/rescan") {
        // The rescan refreshes the server's provider health cache.
        providerHealthy = true;
        return jsonResponse({
          providers: [{ name: "openai", label: "OpenAI", status: "healthy", modelCount: 3, },],
        },);
      }

      if (url === "/api/v1/setup/state") {
        return jsonResponse({
          checks: [{
            id: "provider.health",
            ok: providerHealthy,
            hint: providerHealthy ? undefined : "No provider configured — connect one to enable generation.",
          },],
        },);
      }

      return jsonResponse({ providers: [], },);
    };

    const wizard = createProviderWizard();
    wizard.wizard.savedName = "openai";
    await wizard.loadSetupState();
    expect(wizard.wizard.setupHints,).toEqual(["No provider configured — connect one to enable generation.",],);

    await wizard.testConnection();

    expect(wizard.wizard.testStatus,).toBe("healthy",);
    expect(wizard.wizard.setupHints,).toEqual([],);
  });

  test("saving the model role re-reads the setup state so the role hint clears", async () => {
    let roleSet = false;
    handler = async (url: string,) => {
      if (url.startsWith("/api/v1/admin/model-roles/",)) {
        roleSet = true;
        return jsonResponse({ ok: true, },);
      }

      if (url === "/api/v1/setup/state") {
        return jsonResponse({
          checks: [{
            id: "model.roles",
            ok: roleSet,
            hint: roleSet ? undefined : "Set the main model role to a provider and model.",
          },],
        },);
      }

      return jsonResponse({ providers: [], },);
    };

    const wizard = createProviderWizard();
    wizard.wizard.roleProvider = "openai";
    wizard.wizard.roleModel = "gpt-4o-mini";
    await wizard.loadSetupState();
    expect(wizard.wizard.setupHints,).toEqual(["Set the main model role to a provider and model.",],);

    await wizard.saveWizardRole();

    expect(wizard.wizard.setupHints,).toEqual([],);
  });

  test("a stored api key is kept when the field is left empty", async () => {
    handler = async (_url: string, init: RequestInit,) => {
      if (init.method === "POST") { return jsonResponse({ ok: true, provider: savedProvider, },); }
      return jsonResponse({ providers: [savedProvider,], },);
    };

    const wizard = createProviderWizard();
    await wizard.loadProviders();

    wizard.editProvider("openai",);
    expect(wizard.wizard.hasStoredKey,).toBe(true,);
    expect(wizard.wizard.apiKey,).toBe("",);

    await wizard.saveProvider();

    expect(calls[1]?.body?.apiKey,).toBeUndefined();
    expect(calls[1]?.body?.name,).toBe("openai",);
  });

  test("the role save posts the model-role override", async () => {
    handler = async () => jsonResponse({ ok: true, },);

    const wizard = createProviderWizard();
    wizard.wizard.role = "auxiliary";
    wizard.wizard.roleProvider = "openai";
    wizard.wizard.roleModel = "gpt-4o-mini";

    await wizard.saveWizardRole();

    expect(calls[0]?.url,).toBe("/api/v1/admin/model-roles/auxiliary",);
    expect(calls[0]?.method,).toBe("PUT",);
    expect(calls[0]?.body,).toEqual({ provider: "openai", model: "gpt-4o-mini", },);
    expect(renderedToasts().map((toast,) => toast.type),).toEqual(["success",],);
  });

  test("a failing setup-state fetch leaves the wizard usable", async () => {
    handler = async (url: string,) => {
      if (url === "/api/v1/setup/state") { throw new Error("network down",); }
      return jsonResponse({ providers: [], },);
    };

    const wizard = createProviderWizard();
    wizard.openProviderWizard();

    await wizard.loadSetupState();

    expect(wizard.wizard.setupHints,).toEqual([],);
    expect(wizard.wizard.open,).toBe(true,);
    expect(renderedToasts(),).toHaveLength(0,);
  });
});
