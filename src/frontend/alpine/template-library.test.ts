// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for the prompt-template library Alpine component (FEAT-065).
 *
 * The module registers a `templateLibrary()` factory on globalThis and talks
 * to the server through the ambient `apiFetch` global, so the transport is
 * stubbed by overwriting `globalThis.apiFetch` (same convention as
 * admin-import-wizard.test.ts). `confirm`, `document` and the Blob URL API
 * are stubbed the same way — bun has no DOM.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import "./template-library";

type ApiFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;

interface Draft {
  name: string;
  modality: string;
  description: string;
  payload: string;
}

interface TemplateSummary {
  id: string;
  name: string;
  modality: string;
  isPreset: boolean;
}

interface TemplateLibraryState {
  open: boolean;
  loading: boolean;
  error: string;
  modality: string;
  templates: TemplateSummary[];
  editingId: string;
  draft: Draft | null;
  saving: boolean;
  load(): Promise<void>;
  startCreate(): void;
  startEdit(id: string,): Promise<void>;
  save(): Promise<void>;
  remove(id: string,): Promise<void>;
  exportPack(): Promise<void>;
  importPack(file: File,): Promise<void>;
  autoResize(el: HTMLTextAreaElement,): void;
}

const globalScope = globalThis as unknown as {
  apiFetch?: ApiFetchMock;
  confirm?: (message: string,) => boolean;
  document?: unknown;
  templateLibrary?: () => TemplateLibraryState;
};

const originalFetch = globalScope.apiFetch;
const originalConfirm = globalScope.confirm;
const originalDocument = globalScope.document;
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

interface Call {
  url: string;
  opts?: RequestInit;
}

let calls: Call[] = [];
let handler: ApiFetchMock = async () => Response.json({},);
let confirmResult = true;
let confirmMessages: string[] = [];
let objectUrls: string[] = [];
let revokedUrls: string[] = [];
let clickedAnchors: { href: string; download: string }[] = [];

function factory(): TemplateLibraryState {
  const create = globalScope.templateLibrary;
  if (!create) { throw new Error("templateLibrary() is not registered on globalThis",); }
  return create();
}

beforeEach(() => {
  calls = [];
  confirmResult = true;
  confirmMessages = [];
  objectUrls = [];
  revokedUrls = [];
  clickedAnchors = [];
  handler = async () => Response.json({},);

  globalScope.apiFetch = (url, opts,) => {
    calls.push({ url, opts, },);
    return handler(url, opts,);
  };

  globalScope.confirm = (message: string,) => {
    confirmMessages.push(message,);
    return confirmResult;
  };

  globalScope.document = {
    createElement: (tag: string,) => {
      if (tag !== "a") { return { click: () => {}, }; }
      const anchor = {
        href: "",
        download: "",
        click: () => {
          clickedAnchors.push({ href: anchor.href, download: anchor.download, },);
        },
      };

      return anchor;
    },
  };

  URL.createObjectURL = () => {
    const url = `blob:test-${objectUrls.length + 1}`;
    objectUrls.push(url,);
    return url;
  };

  URL.revokeObjectURL = (url: string,) => {
    revokedUrls.push(url,);
  };
},);

afterEach(() => {
  globalScope.apiFetch = originalFetch;
  globalScope.confirm = originalConfirm;
  globalScope.document = originalDocument;
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
},);

// ── load ─────────────────────────────────────────────────────────────

describe("templateLibrary.load", () => {
  test('registers the factory on globalThis for x-data="templateLibrary()"', () => {
    expect(typeof globalScope.templateLibrary,).toBe("function",);
  });

  test("loads templates from GET /api/v1/templates", async () => {
    handler = async () =>
      Response.json({
        templates: [
          { id: "t1", name: "Mine", modality: "image", isPreset: false, },
          { id: "p1", name: "Preset", modality: "text", isPreset: true, },
        ],
      },);

    const state = factory();
    await state.load();

    expect(calls.length,).toBe(1,);
    expect(calls[0]?.url,).toBe("/api/v1/templates",);
    expect(state.templates.length,).toBe(2,);
    expect(state.templates[0]?.name,).toBe("Mine",);
    expect(state.error,).toBe("",);
    expect(state.loading,).toBe(false,);
  });

  test("appends the modality filter as an encoded query parameter", async () => {
    const state = factory();
    state.modality = "image gen";
    await state.load();

    expect(calls[0]?.url,).toBe("/api/v1/templates?modality=image%20gen",);
  });

  test("omits the query parameter when no modality is selected", async () => {
    const state = factory();
    state.modality = "";
    await state.load();

    expect(calls[0]?.url,).toBe("/api/v1/templates",);
  });

  test("a body without templates yields an empty list", async () => {
    handler = async () => Response.json({},);

    const state = factory();
    await state.load();

    expect(state.templates,).toEqual([],);
    expect(state.error,).toBe("",);
  });

  test("a non-ok response surfaces an error and clears loading", async () => {
    handler = async () => new Response("nope", { status: 500, },);

    const state = factory();
    await state.load();

    expect(state.error,).toBe("Failed to load templates",);
    expect(state.loading,).toBe(false,);
  });

  test("a thrown request surfaces the same error", async () => {
    handler = async () => {
      throw new Error("offline",);
    };

    const state = factory();
    await state.load();

    expect(state.error,).toBe("Failed to load templates",);
    expect(state.loading,).toBe(false,);
  });

  test("a successful reload clears a previous error", async () => {
    handler = async () => new Response("nope", { status: 500, },);
    const state = factory();
    await state.load();
    expect(state.error,).toBe("Failed to load templates",);

    handler = async () => Response.json({ templates: [], },);
    await state.load();

    expect(state.error,).toBe("",);
  });
});

// ── startCreate ───────────────────────────────────────────────────────

describe("templateLibrary.startCreate", () => {
  test("starts an empty draft in image modality and clears the edited id", () => {
    const state = factory();
    state.editingId = "t1";
    state.startCreate();

    expect(state.editingId,).toBe("",);
    expect(state.draft,).not.toBeNull();
    expect(state.draft?.name,).toBe("",);
    expect(state.draft?.modality,).toBe("image",);
    expect(state.draft?.description,).toBe("",);
    expect(state.draft?.payload,).toBe('{\n  "templateBody": ""\n}',);
  });
});

// ── startEdit ─────────────────────────────────────────────────────────

describe("templateLibrary.startEdit", () => {
  test("opens an owned template for editing", async () => {
    handler = async () =>
      Response.json({
        template: {
          id: "t1",
          name: "Mine",
          modality: "image",
          description: "desc",
          isPreset: false,
          payload: { templateBody: "hello", },
        },
      },);

    const state = factory();
    await state.startEdit("t1",);

    expect(calls[0]?.url,).toBe("/api/v1/templates/t1",);
    expect(state.editingId,).toBe("t1",);
    expect(state.draft?.name,).toBe("Mine",);
    expect(state.draft?.modality,).toBe("image",);
    expect(state.draft?.description,).toBe("desc",);
    expect(state.draft?.payload,).toBe('{\n  "templateBody": "hello"\n}',);
  });

  test("encodes the template id in the request path", async () => {
    handler = async () => Response.json({ template: { id: "a b", isPreset: false, payload: {}, }, },);

    const state = factory();
    await state.startEdit("a b",);

    expect(calls[0]?.url,).toBe("/api/v1/templates/a%20b",);
  });

  test("a preset opens as a copy that is not bound to the preset id", async () => {
    handler = async () =>
      Response.json({
        template: {
          id: "p1",
          name: "Cinematic",
          modality: "text",
          description: null,
          isPreset: true,
          payload: { templateBody: "x", },
        },
      },);

    const state = factory();
    await state.startEdit("p1",);

    expect(state.editingId,).toBe("",);
    expect(state.draft?.name,).toBe("Cinematic (copy)",);
    expect(state.draft?.modality,).toBe("text",);
    expect(state.draft?.description,).toBe("",);
  });

  test("a non-ok response surfaces an error and leaves the draft alone", async () => {
    handler = async () => new Response("nope", { status: 404, },);

    const state = factory();
    state.draft = { name: "keep", modality: "image", description: "", payload: "{}", };
    await state.startEdit("t1",);

    expect(state.error,).toBe("Failed to load template",);
    expect(state.draft?.name,).toBe("keep",);
  });

  test("a thrown request surfaces the same error", async () => {
    handler = async () => {
      throw new Error("offline",);
    };

    const state = factory();
    await state.startEdit("t1",);

    expect(state.error,).toBe("Failed to load template",);
  });
});

// ── save ──────────────────────────────────────────────────────────────

describe("templateLibrary.save", () => {
  test("does nothing without a draft", async () => {
    const state = factory();
    state.draft = null;
    await state.save();

    expect(calls.length,).toBe(0,);
    expect(state.saving,).toBe(false,);
  });

  test("rejects a payload that is not valid JSON without calling the API", async () => {
    const state = factory();
    state.draft = { name: "x", modality: "image", description: "", payload: "{oops", };
    await state.save();

    expect(calls.length,).toBe(0,);
    expect(state.error,).toBe("Payload is not valid JSON",);
    expect(state.saving,).toBe(false,);
  });

  test("creates a new template with POST and reloads the list", async () => {
    handler = async () => Response.json({ templates: [], },);

    const state = factory();
    state.draft = { name: "New", modality: "text", description: "d", payload: '{"a":1}', };
    await state.save();

    expect(calls[0]?.url,).toBe("/api/v1/templates",);
    expect(calls[0]?.opts?.method,).toBe("POST",);
    expect(JSON.parse(String(calls[0]?.opts?.body,),),).toEqual({
      name: "New",
      modality: "text",
      description: "d",
      payload: { a: 1, },
    },);

    // The list is reloaded after a successful save.
    expect(calls[1]?.url,).toBe("/api/v1/templates",);
    expect(state.draft,).toBeNull();
    expect(state.editingId,).toBe("",);
    expect(state.error,).toBe("",);
  });

  test("omits an empty description from the create payload", async () => {
    handler = async () => Response.json({ templates: [], },);

    const state = factory();
    state.draft = { name: "New", modality: "text", description: "", payload: "{}", };
    await state.save();

    const body = JSON.parse(String(calls[0]?.opts?.body,),) as Record<string, unknown>;
    expect("description" in body,).toBe(false,);
  });

  test("updates an existing template with PATCH to the edited id", async () => {
    handler = async () => Response.json({ templates: [], },);

    const state = factory();
    state.editingId = "t1";
    state.draft = { name: "Renamed", modality: "image", description: "", payload: "{}", };
    await state.save();

    expect(calls[0]?.url,).toBe("/api/v1/templates/t1",);
    expect(calls[0]?.opts?.method,).toBe("PATCH",);
    expect(state.draft,).toBeNull();
  });

  test("shows the server message when the save fails", async () => {
    handler = async () => Response.json({ message: "Name already used", }, { status: 409, },);

    const state = factory();
    state.draft = { name: "Dup", modality: "image", description: "", payload: "{}", };
    await state.save();

    expect(state.error,).toBe("Name already used",);
    expect(state.draft,).not.toBeNull();
    expect(state.saving,).toBe(false,);
  });

  test("falls back to a generic message when the failure carries none", async () => {
    handler = async () => new Response("", { status: 500, },);

    const state = factory();
    state.draft = { name: "x", modality: "image", description: "", payload: "{}", };
    await state.save();

    expect(state.error,).toBe("Save failed",);
  });
});

// ── remove ────────────────────────────────────────────────────────────

describe("templateLibrary.remove", () => {
  test("does nothing when the confirmation is declined", async () => {
    confirmResult = false;

    const state = factory();
    await state.remove("t1",);

    expect(calls.length,).toBe(0,);
    expect(confirmMessages[0],).toBe("Delete this template?",);
  });

  test("deletes the template and reloads the list", async () => {
    const state = factory();
    await state.remove("t1",);

    expect(calls[0]?.url,).toBe("/api/v1/templates/t1",);
    expect(calls[0]?.opts?.method,).toBe("DELETE",);
    expect(calls[1]?.url,).toBe("/api/v1/templates",);
  });

  test("encodes the template id in the delete path", async () => {
    const state = factory();
    await state.remove("a/b",);

    expect(calls[0]?.url,).toBe("/api/v1/templates/a%2Fb",);
  });

  test("a thrown request surfaces a delete error", async () => {
    handler = async () => {
      throw new Error("offline",);
    };

    const state = factory();
    await state.remove("t1",);

    expect(state.error,).toBe("Delete failed",);
  });
});

// ── exportPack ────────────────────────────────────────────────────────

describe("templateLibrary.exportPack", () => {
  test("downloads the pack as template-pack.json", async () => {
    handler = async () => Response.json({ templates: [{ id: "t1", },], },);

    const state = factory();
    await state.exportPack();

    expect(calls[0]?.url,).toBe("/api/v1/templates/export",);
    expect(clickedAnchors.length,).toBe(1,);
    expect(clickedAnchors[0]?.download,).toBe("template-pack.json",);
    expect(clickedAnchors[0]?.href,).toBe(objectUrls[0],);
    expect(revokedUrls,).toContain(objectUrls[0] ?? "",);
    expect(state.error,).toBe("",);
  });

  test("a non-ok response surfaces an export error and downloads nothing", async () => {
    handler = async () => new Response("nope", { status: 500, },);

    const state = factory();
    await state.exportPack();

    expect(state.error,).toBe("Export failed",);
    expect(clickedAnchors.length,).toBe(0,);
  });

  test("an unserialisable pack surfaces an export error", async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const circularResponse = { ok: true, json: async () => circular, } as unknown as Response;
    handler = async () => circularResponse;

    const state = factory();
    await state.exportPack();

    expect(state.error,).toBe("Export failed",);
    expect(clickedAnchors.length,).toBe(0,);
  });
});

// ── importPack ────────────────────────────────────────────────────────

describe("templateLibrary.importPack", () => {
  test("rejects a file that is not valid JSON without calling the API", async () => {
    const state = factory();
    await state.importPack(new File(["not json",], "pack.json",),);

    expect(calls.length,).toBe(0,);
    expect(state.error,).toBe("Import failed",);
  });

  test("posts the parsed pack and reloads the list", async () => {
    handler = async () => Response.json({ templates: [], },);

    const state = factory();
    await state.importPack(new File([JSON.stringify({ templates: [{ id: "t1", },], },),], "pack.json",),);

    expect(calls[0]?.url,).toBe("/api/v1/templates/import",);
    expect(calls[0]?.opts?.method,).toBe("POST",);
    expect(JSON.parse(String(calls[0]?.opts?.body,),),).toEqual({ templates: [{ id: "t1", },], },);
    expect(calls[1]?.url,).toBe("/api/v1/templates",);
    expect(state.error,).toBe("",);
  });

  test("a non-ok response surfaces an import error", async () => {
    handler = async () => new Response("nope", { status: 400, },);

    const state = factory();
    await state.importPack(new File(["{}",], "pack.json",),);

    expect(state.error,).toBe("Import failed",);
  });

  test("an unreadable file surfaces an import error", async () => {
    const state = factory();
    const unreadable = {
      text: async () => {
        throw new Error("unreadable",);
      },
    } as unknown as File;

    await state.importPack(unreadable,);

    expect(state.error,).toBe("Import failed",);
  });
});

// ── autoResize ────────────────────────────────────────────────────────

describe("templateLibrary.autoResize", () => {
  test("resizes the textarea to its content height", () => {
    const el = { style: { height: "", }, scrollHeight: 120, } as unknown as HTMLTextAreaElement;

    factory().autoResize(el,);

    expect(el.style.height,).toBe("120px",);
  });
});
