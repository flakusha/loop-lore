// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression test for the world Edit modal: it is served as a static
 * partial with blank fields, and saving it as-is wiped the world's
 * description and lore. Opening it must show the world's CURRENT values,
 * and an untouched save must carry them instead of clearing them.
 *
 * Resource contract (parallel-safe):
 * - This file OWNS the `globalThis.apiFetch` slot for the duration of one
 *   test - the ambient `apiFetch` global is shared with every other suite in
 *   this worker, so a leaked stub silently hijacks their network calls. The
 *   slot is taken in `beforeEach` and released in `afterEach`, so a failed
 *   assertion cannot poison the next test.
 * - The stub is installed unconditionally, so a prior suite's leaked stub
 *   cannot satisfy the component and silently pass the assertions.
 * - No ordering dependence: `fetchHandler` and `fetchCalls` are per-file
 *   state reset in `beforeEach`, so no test observes another test's requests
 *   and each one passes on its own.
 * - No database, port, file or provider is touched: the modal reads through
 *   the stubbed `apiFetch` and the assertions read the served partial from
 *   disk.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { readFileSync, } from "node:fs";
import { join, } from "node:path";
import { fillFields, prefillWorldEditModal, worldEditModal, } from "./world-edit-modal";

// TODO(env): bun-only — `bun:test` and `import.meta.dir` are Bun-specific APIs;
// add a node shim (node:test + import.meta.dirname) when a node test target lands.
const TEST_DIR = import.meta.dir;

/** The world row as GET /api/v1/worlds/:id returns it. */
const WORLD = {
  id: "w-1",
  name: "Ashfen",
  description: "A drowned city of bells",
  lore: "The bells still ring under the tide.",
  visibility: "private",
  meta: { version: "v1", },
};

const globalState = globalThis as unknown as {
  apiFetch?: (url: string, opts?: RequestInit,) => Promise<Response>;
};

const originalApiFetch = globalState.apiFetch;
let fetchHandler: (url: string,) => Promise<Response> = async () => Response.json({},);
let fetchCalls = 0;

beforeEach(() => {
  fetchCalls = 0;
  fetchHandler = async () => Response.json({},);
  // The slot is taken unconditionally, so a prior suite's leaked stub
  // cannot satisfy the component and silently pass the assertions.
  globalState.apiFetch = (url,) => {
    fetchCalls += 1;
    return fetchHandler(url,);
  };
},);

afterEach(() => {
  globalState.apiFetch = originalApiFetch;
},);

/** A modal field that records the value written into it. */
interface FakeField {
  value: string;
  events: string[];
  dispatchEvent(event: Event,): boolean;
}

/** The modal's Save button. */
interface FakeSave {
  disabled: boolean;
}

/** The modal markup as the browser would hold it. */
interface FakeModal {
  root: ParentNode;
  fields: Record<string, FakeField>;
  save: FakeSave;
}

/**
 * Build the modal DOM the partial renders: a form whose PUT target carries
 * the world id, the three fields and a Save button that ships disabled.
 * @param worldId the world the form targets (null - no usable target)
 * @returns the fake modal
 */
function makeModal(worldId: string | null,): FakeModal {
  const fields: Record<string, FakeField> = {
    "#edit-name": {
      value: "",
      events: [],
      dispatchEvent: (event,) => {
        fields["#edit-name"]?.events.push(event.type,);
        return true;
      },
    },
    "#edit-description": {
      value: "",
      events: [],
      dispatchEvent: (event,) => {
        fields["#edit-description"]?.events.push(event.type,);
        return true;
      },
    },
    "#edit-lore": {
      value: "",
      events: [],
      dispatchEvent: (event,) => {
        fields["#edit-lore"]?.events.push(event.type,);
        return true;
      },
    },
  };

  const save: FakeSave = { disabled: true, };

  const form = {
    getAttribute: (name: string,) => name === "hx-put" && worldId ? `/api/v1/worlds/${worldId}` : null,
  };

  const root = {
    querySelector: (selector: string,) => {
      if (selector === "#edit-world-form") { return form; }
      if (selector === "#edit-world-save") { return save; }
      return fields[selector] ?? null;
    },
  };

  return { root: root as unknown as ParentNode, fields, save, };
}

/**
 * Open the modal the way Alpine does: mount the component and let its init
 * load the world.
 * @param modal the fake modal
 * @returns the component that was mounted
 */
async function openModal(modal: FakeModal,): Promise<ReturnType<typeof worldEditModal>> {
  const component = worldEditModal();
  component.$el = modal.root as unknown as HTMLElement;
  await component.init();
  return component;
}

describe("alpine/world-edit-modal", () => {
  test("opening the Edit modal shows the world's current values", async () => {
    fetchHandler = async () => Response.json(WORLD,);
    const modal = makeModal("w-1",);

    await openModal(modal,);

    expect(modal.fields["#edit-name"]?.value,).toBe("Ashfen",);
    expect(modal.fields["#edit-description"]?.value,).toBe("A drowned city of bells",);
    expect(modal.fields["#edit-lore"]?.value,).toBe("The bells still ring under the tide.",);
    expect(modal.save.disabled,).toBe(false,);
  });

  test("an untouched save carries the world's current values instead of clearing them", async () => {
    fetchHandler = async () => Response.json(WORLD,);
    const modal = makeModal("w-1",);

    await openModal(modal,);

    // What the form submits when the user changes nothing.
    const submitted = {
      name: modal.fields["#edit-name"]?.value,
      description: modal.fields["#edit-description"]?.value,
      lore: modal.fields["#edit-lore"]?.value,
    };

    expect(submitted,).toEqual({
      name: WORLD.name,
      description: WORLD.description,
      lore: WORLD.lore,
    },);
  });

  test("prefillWorldEditModal requests the world the form targets", async () => {
    let seen = "";
    fetchHandler = async (url: string,) => {
      seen = url;
      return Response.json(WORLD,);
    };

    // A world id carrying "/" must stay one id - taking the last path
    // segment would load a DIFFERENT world into this modal.
    const modal = makeModal("w-1/w-2",);

    const ok = await prefillWorldEditModal(modal.root,);

    expect(ok,).toBe(true,);
    expect(seen,).toBe("/api/v1/worlds/w-1%2Fw-2",);
  });

  test("prefillWorldEditModal fails closed when a field is missing", async () => {
    fetchHandler = async () => Response.json(WORLD,);
    // The served partial always renders all three fields; drop one the way
    // a hand-edited or truncated copy would, and the load must refuse to
    // enable Save rather than submit "" over the missing column.
    const modal = makeModal("w-1",);
    delete modal.fields["#edit-lore"];

    // fillFields itself reports the incomplete fill.
    expect(fillFields(modal.root, { name: "x", description: "y", lore: "z", },),).toBe(false,);

    const ok = await prefillWorldEditModal(modal.root,);

    expect(ok,).toBe(false,);
    expect(modal.save.disabled,).toBe(true,);
  });

  test("a world that cannot be loaded leaves Save disabled and the fields empty", async () => {
    fetchHandler = async () => new Response("boom", { status: 500, },);
    const modal = makeModal("w-1",);

    const component = await openModal(modal,);

    expect(component.loadError,).toBe(true,);
    expect(modal.fields["#edit-description"]?.value,).toBe("",);
    expect(modal.fields["#edit-lore"]?.value,).toBe("",);
    expect(modal.save.disabled,).toBe(true,);
  });

  test("retry after a failed load fills the fields and clears the error", async () => {
    fetchHandler = async () => new Response("boom", { status: 500, },);
    const modal = makeModal("w-1",);
    const component = await openModal(modal,);
    expect(component.loadError,).toBe(true,);

    fetchHandler = async () => Response.json(WORLD,);
    await component.retry();

    expect(modal.fields["#edit-name"]?.value,).toBe("Ashfen",);
    expect(modal.fields["#edit-description"]?.value,).toBe("A drowned city of bells",);
    expect(modal.fields["#edit-lore"]?.value,).toBe("The bells still ring under the tide.",);
    expect(component.loadError,).toBe(false,);
    expect(modal.save.disabled,).toBe(false,);
  });

  test("text typed during the load wins over the loaded values", async () => {
    fetchHandler = async () => Response.json(WORLD,);
    const modal = makeModal("w-1",);
    modal.fields["#edit-description"]!.value = "Typed By User";

    const component = await openModal(modal,);

    expect(modal.fields["#edit-description"]?.value,).toBe("Typed By User",);
    expect(modal.fields["#edit-name"]?.value,).toBe("Ashfen",);
    expect(modal.fields["#edit-lore"]?.value,).toBe("The bells still ring under the tide.",);
    expect(modal.save.disabled,).toBe(false,);
    expect(component.loadError,).toBe(false,);
  });

  test("a payload that is not a world row leaves the fields empty and Save disabled", async () => {
    // The row is decoded through a schema before any field is read. A payload
    // that does not match must fail closed - guessing the fields would put
    // wrong text into a form that submits them over the world's own.
    fetchHandler = async () => Response.json({ id: "w-1", name: 42, description: { nope: true, }, },);
    const modal = makeModal("w-1",);

    await openModal(modal,);

    expect(modal.fields["#edit-name"]?.value,).toBe("",);
    expect(modal.fields["#edit-description"]?.value,).toBe("",);
    expect(modal.fields["#edit-lore"]?.value,).toBe("",);
    expect(modal.save.disabled,).toBe(true,);
  });

  test("a modal without a world target never fetches and stays unsaveable", async () => {
    fetchHandler = async () => Response.json(WORLD,);

    const modal = makeModal(null,);

    await openModal(modal,);

    expect(fetchCalls,).toBe(0,);
    expect(modal.fields["#edit-description"]?.value,).toBe("",);
    expect(modal.save.disabled,).toBe(true,);
  });

  test("the served modal wires the prefill and blocks an empty save", () => {
    const html = readFileSync(
      join(TEST_DIR, "../../partials/worlds/edit-modal.html",),
      "utf8",
    );

    expect(html,).toContain(`x-data="worldEditModal()"`,);
    expect(html,).toContain(`id="edit-world-form"`,);
    expect(html,).toContain(`hx-put="/api/v1/worlds/{{worldId}}"`,);
    expect(html,).toContain(`id="edit-name"`,);
    expect(html,).toContain(`id="edit-description"`,);
    expect(html,).toContain(`id="edit-lore"`,);
    // A failed load renders inline: an alert paragraph plus a Retry button
    // re-invoking the load. Save stays disabled until success.
    expect(html,).toContain(`role="alert"`,);
    expect(html,).toContain(`x-on:click="retry()"`,);
    expect(html,).toContain(`id="edit-world-retry"`,);
    // Save ships disabled - only a loaded world may be submitted.
    expect(html,).toMatch(/id="edit-world-save"[^>]*disabled/,);
  });

  test("the name field mirrors the backend's length limit", () => {
    const html = readFileSync(
      join(TEST_DIR, "../../partials/worlds/edit-modal.html",),
      "utf8",
    );

    const primitives = readFileSync(
      join(TEST_DIR, "../../validation/schemas/primitives.ts",),
      "utf8",
    );

    // The backend is the truth: Name is t.String({ minLength: 1, maxLength: 255 }).
    const nameSchema = primitives.match(/Name = t\.String\(\{[^}]*\}/,)?.[0] ?? "";
    const limit = nameSchema.match(/maxLength: (\d+)/,)?.[1];
    expect(limit,).toBe("255",);
    // The frontend copy must match it - a longer name is rejected server-side,
    // and the whole save (with the description and lore edits) is lost with it.
    expect(html,).toContain(`maxlength="${limit}"`,);
  });
});
