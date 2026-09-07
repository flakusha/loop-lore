// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import "./personas";

type ApiFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;
const g = globalThis as unknown as {
  apiFetch?: ApiFetchMock;
  personasPage?: () => Record<string, unknown>;
};
const originalFetch = g.apiFetch;

interface PersonaItem {
  id: string;
  name: string;
  description: string | null;
  title: string | null;
  is_default: string;
  temperature: number | null;
  max_tokens: number | null;
  model: string | null;
}

interface PersonasState {
  personas: PersonaItem[];
  filtered: PersonaItem[];
  search: string;
  loading: boolean;
  personaAvailableModels: string[];
  loadPersonas(): Promise<void>;
  loadPersonaModels(): Promise<void>;
  _collectModelsForProvider(providerName: string, models: string[],): Promise<void>;
  filterList(): void;
}

function fresh(): PersonasState {
  return g.personasPage!() as unknown as PersonasState;
}

let calls: { url: string; opts: RequestInit }[] = [];
let handler: ApiFetchMock = async () => Response.json({},);
const uiStore: Record<string, unknown> = {};
const gAlpine = globalThis as unknown as { Alpine?: unknown };
const originalAlpine = gAlpine.Alpine;

beforeEach(() => {
  calls = [];
  handler = async () => Response.json({},);
  g.apiFetch = (url, opts,) => {
    calls.push({ url, opts: opts ?? {}, },);
    return handler(url, opts,);
  };
  for (const k of Object.keys(uiStore,)) { delete uiStore[k]; }
  gAlpine.Alpine = {
    store: (name: string,) => {
      if (name === "ui") { return uiStore; }
      return {};
    },
  };
},);

afterEach(() => {
  g.apiFetch = originalFetch;
  gAlpine.Alpine = originalAlpine;
},);

const persona = (overrides: Partial<PersonaItem> = {},): PersonaItem => ({
  id: "p1",
  name: "Aria",
  description: null,
  title: null,
  is_default: "",
  temperature: null,
  max_tokens: null,
  model: null,
  ...overrides,
});

describe("personasPage.filterList", () => {
  test("passes everything through on a blank query", () => {
    const s = fresh();
    s.personas = [persona(), persona({ id: "p2", name: "Bob", },),];
    s.search = "   ";
    s.filterList();
    expect(s.filtered,).toHaveLength(2,);
  });

  test("matches case-insensitively on name", () => {
    const s = fresh();
    s.personas = [persona({ name: "Aria Star", },), persona({ name: "Bob", },),];
    s.search = "aria";
    s.filterList();
    expect(s.filtered.map((p,) => p.name),).toEqual(["Aria Star",],);
  });

  test("matches unicode queries", () => {
    const s = fresh();
    s.personas = [persona({ name: "影の案内人", },), persona({ name: "Bob", },),];
    s.search = "影の";
    s.filterList();
    expect(s.filtered,).toHaveLength(1,);
  });

  test("returns an empty list when nothing matches", () => {
    const s = fresh();
    s.personas = [persona(),];
    s.search = "zzz-no-match";
    s.filterList();
    expect(s.filtered,).toEqual([],);
  });
});

describe("personasPage.loadPersonas", () => {
  test("stores the array and filters", async () => {
    handler = async () => Response.json([persona(), persona({ id: "p2", name: "Bob", },),],);
    const s = fresh();
    s.search = "";
    await s.loadPersonas();
    expect(s.personas,).toHaveLength(2,);
    expect(s.filtered,).toHaveLength(2,);
    expect(s.loading,).toBe(false,);
  });

  test("coerces non-array payloads to an empty list", async () => {
    handler = async () => Response.json({ data: [], },);
    const s = fresh();
    await s.loadPersonas();
    expect(s.personas,).toEqual([],);
    expect(s.filtered,).toEqual([],);
    expect(s.loading,).toBe(false,);
  });

  test("keeps stale rows on network error", async () => {
    handler = async () => {
      throw new Error("offline",);
    };
    const s = fresh();
    s.personas = [persona(),];
    await s.loadPersonas();
    expect(s.personas,).toHaveLength(1,);
    expect(s.loading,).toBe(false,);
  });
});

describe("personasPage.loadPersonaModels", () => {
  test("collects models from healthy providers only", async () => {
    handler = async (url,) => {
      if (url === "/api/providers") {
        return Response.json({
          providers: [
            { name: "good", status: "healthy", },
            { name: "bad", status: "down", },
          ],
        },);
      }
      if (url === "/api/admin/providers/good/models") {
        return Response.json({ models: [{ id: "m1", }, { id: "m2", },], },);
      }
      return Response.json({ models: [{ id: "should-not-appear", },], },);
    };
    const s = fresh();
    await s.loadPersonaModels();
    expect(s.personaAvailableModels,).toEqual(["m1", "m2",],);
    expect(calls.some((c,) => c.url.includes("/bad/",)),).toBe(false,);
  });

  test("dedupes models across providers", async () => {
    handler = async (url,) => {
      if (url === "/api/providers") {
        return Response.json({ providers: [{ name: "a", status: "healthy", }, { name: "b", status: "healthy", },], },);
      }
      return Response.json({ models: [{ id: "same", },], },);
    };
    const s = fresh();
    await s.loadPersonaModels();
    expect(s.personaAvailableModels,).toEqual(["same",],);
  });

  test("keeps an empty list when the provider list fails", async () => {
    handler = async () => new Response("x", { status: 500, },);
    const s = fresh();
    await s.loadPersonaModels();
    expect(s.personaAvailableModels,).toEqual([],);
  });

  test("skips providers whose model fetch fails", async () => {
    handler = async (url,) => {
      if (url === "/api/providers") {
        return Response.json({ providers: [{ name: "flaky", status: "healthy", },], },);
      }
      throw new Error("offline",);
    };
    const s = fresh();
    await s.loadPersonaModels();
    expect(s.personaAvailableModels,).toEqual([],);
  });
});

describe("personasPage.init", () => {
  test("loads personas and models", async () => {
    const s = fresh();
    let personas = 0;
    let models = 0;
    s.loadPersonas = async () => {
      personas++;
    };
    s.loadPersonaModels = async () => {
      models++;
    };
    await (s as unknown as { init(): Promise<void> }).init();
    expect(personas,).toBe(1,);
    expect(models,).toBe(1,);
  });
});

describe("personasPage.editPersona", () => {
  test("seeds the form from the row", () => {
    const s = fresh() as unknown as Record<string, unknown> & {
      editPersona(p: unknown,): void;
      formName: string;
      formTitle: string;
      formDescription: string;
      formIsDefault: boolean;
      formModel: string;
      formMaxTokens: unknown;
      formTemperature: unknown;
    };
    s.editPersona(
      persona({
        name: "Aria",
        title: "Guide",
        description: "helps",
        is_default: "default",
        model: "m1",
        max_tokens: 100,
        temperature: 0.5,
      },),
    );
    expect(s.formName,).toBe("Aria",);
    expect(s.formTitle,).toBe("Guide",);
    expect(s.formDescription,).toBe("helps",);
    expect(s.formIsDefault,).toBe(true,);
    expect(s.formModel,).toBe("m1",);
    expect(s.formMaxTokens,).toBe(100,);
    expect(s.formTemperature,).toBe(0.5,);
  });

  test("defaults blank optional fields", () => {
    const s = fresh() as unknown as Record<string, unknown> & {
      editPersona(p: unknown,): void;
      formTitle: string;
      formIsDefault: boolean;
      formModel: string;
    };
    s.editPersona(persona(),);
    expect(s.formTitle,).toBe("",);
    expect(s.formIsDefault,).toBe(false,);
    expect(s.formModel,).toBe("",);
  });
});

describe("personasPage.savePersona", () => {
  test("ignores blank names", async () => {
    const s = fresh() as unknown as Record<string, unknown> & { savePersona(): Promise<void>; formName: string };
    s.formName = "   ";
    await s.savePersona();
    expect(calls,).toHaveLength(0,);
  });

  test("creates via POST and resets the form", async () => {
    handler = async () => Response.json({ id: "p9", }, { status: 201, },);
    const s = fresh() as unknown as Record<string, unknown> & {
      savePersona(): Promise<void>;
      formName: string;
      formTitle: string;
      formDescription: string;
      formModel: string;
      formMaxTokens: string;
      formTemperature: string;
      loadPersonas(): Promise<void>;
    };
    s.formName = "  New  ";
    s.formTitle = "T";
    s.formDescription = "D";
    s.formModel = "m1";
    s.formMaxTokens = "";
    s.formTemperature = "";
    let reloaded = 0;
    s.loadPersonas = async () => {
      reloaded++;
    };
    await s.savePersona();
    expect(calls[0]!.url,).toBe("/api/personas",);
    expect(calls[0]!.opts.method,).toBe("POST",);
    expect(JSON.parse(calls[0]!.opts.body as string,),).toMatchObject({ name: "New", title: "T", model: "m1", },);
    expect(s.formName,).toBe("",);
    expect(reloaded,).toBe(1,);
  });

  test("updates via PATCH when a persona is active", async () => {
    handler = async () => Response.json({}, { status: 200, },);
    const g = globalThis as unknown as { Alpine?: unknown };
    const prev = g.Alpine;
    uiStore.activePersona = persona({ id: "p1", },);
    uiStore.showPersonaForm = true;
    const ui: Record<string, unknown> = uiStore;
    try {
      const s = fresh() as unknown as Record<string, unknown> & {
        savePersona(): Promise<void>;
        formName: string;
        formIsDefault: boolean;
        loadPersonas(): Promise<void>;
      };
      s.formName = "Renamed";
      s.formIsDefault = true;
      s.loadPersonas = async () => {};
      await s.savePersona();
      expect(calls[0]!.url,).toBe("/api/personas/p1",);
      expect(calls[0]!.opts.method,).toBe("PATCH",);
      expect(JSON.parse(calls[0]!.opts.body as string,),).toMatchObject({ name: "Renamed", isDefault: true, },);
      expect(ui.showPersonaForm,).toBe(false,);
    } finally {
      g.Alpine = prev;
    }
  });

  test("keeps the form when the network fails", async () => {
    handler = async () => {
      throw new Error("offline",);
    };
    const s = fresh() as unknown as Record<string, unknown> & {
      savePersona(): Promise<void>;
      formName: string;
      saving: boolean;
      loadPersonas(): Promise<void>;
    };
    s.formName = "Keep";
    s.loadPersonas = async () => {};
    await s.savePersona();
    expect(s.formName,).toBe("Keep",);
    expect(s.saving,).toBe(false,);
  });
});

describe("personasPage.deletePersona", () => {
  test("DELETEs and filters the row", async () => {
    handler = async () => Response.json({}, { status: 200, },);
    const g = globalThis as unknown as { confirm?: (msg?: string,) => boolean };
    const prev = g.confirm;
    g.confirm = () => true;
    try {
      const s = fresh();
      s.personas = [persona({ id: "p1", name: "Aria", },), persona({ id: "p2", name: "Bob", },),];
      s.search = "";
      await (s as unknown as { deletePersona(id: string,): Promise<void> }).deletePersona("p1",);
      expect(calls[0]!.url,).toBe("/api/personas/p1",);
      expect(s.personas.map((p,) => p.id),).toEqual(["p2",],);
      expect(s.filtered.map((p,) => p.id),).toEqual(["p2",],);
    } finally {
      g.confirm = prev;
    }
  });

  test("aborts when confirm is declined", async () => {
    const g = globalThis as unknown as { confirm?: (msg?: string,) => boolean };
    const prev = g.confirm;
    g.confirm = () => false;
    try {
      const s = fresh();
      s.personas = [persona(),];
      await (s as unknown as { deletePersona(id: string,): Promise<void> }).deletePersona("p1",);
      expect(calls,).toHaveLength(0,);
      expect(s.personas,).toHaveLength(1,);
    } finally {
      g.confirm = prev;
    }
  });

  test("handles unicode names in the filter after delete", async () => {
    handler = async () => Response.json({}, { status: 200, },);
    const g = globalThis as unknown as { confirm?: (msg?: string,) => boolean };
    const prev = g.confirm;
    g.confirm = () => true;
    try {
      const s = fresh();
      s.personas = [persona({ id: "p1", name: "影", },),];
      s.search = "影";
      await (s as unknown as { deletePersona(id: string,): Promise<void> }).deletePersona("p1",);
      expect(s.filtered,).toEqual([],);
    } finally {
      g.confirm = prev;
    }
  });
});

describe("personasPage.onDefaultChange", () => {
  test("is a no-op handled on save", () => {
    const s = fresh();
    expect(() => (s as unknown as { onDefaultChange(): void }).onDefaultChange()).not.toThrow();
  });
});
