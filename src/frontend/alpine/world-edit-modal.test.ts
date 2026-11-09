// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression test for the world Edit modal: it is served as a static
 * partial with blank fields, and saving it as-is wiped the world's
 * description and lore. Opening it must show the world's CURRENT values,
 * and an untouched save must carry them instead of clearing them.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { readFileSync, } from "node:fs";
import { join, } from "node:path";
import { worldEditModal, } from "./world-edit-modal";

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

  test("a world that cannot be loaded leaves Save disabled and the fields empty", async () => {
    fetchHandler = async () => new Response("boom", { status: 500, },);
    const modal = makeModal("w-1",);

    await openModal(modal,);

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
      join(import.meta.dir, "../../partials/worlds/edit-modal.html",),
      "utf8",
    );

    expect(html,).toContain(`x-data="worldEditModal()"`,);
    expect(html,).toContain(`id="edit-world-form"`,);
    expect(html,).toContain(`hx-put="/api/v1/worlds/{{worldId}}"`,);
    expect(html,).toContain(`id="edit-name"`,);
    expect(html,).toContain(`id="edit-description"`,);
    expect(html,).toContain(`id="edit-lore"`,);
    // Save ships disabled - only a loaded world may be submitted.
    expect(html,).toMatch(/id="edit-world-save"[^>]*disabled/,);
  });
});
