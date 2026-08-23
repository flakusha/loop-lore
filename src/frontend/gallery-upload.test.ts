/**
 * Tests for frontend/gallery-upload.ts — file-type validation + dropzone wiring.
 *
 * Stubs globalThis.document with a minimal mock to exercise initDropZone
 * without requiring happy-dom.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { ALLOWED_TYPES, initDropZone, isAllowedType, } from "./gallery-upload";

// ── DOM stub ────────────────────────────────────────────────────────────────
type FakeEl = {
  tagName: string;
  id: string;
  type: string;
  classList: {
    _set: Set<string>;
    add: (c: string,) => void;
    remove: (c: string,) => void;
    contains: (c: string,) => boolean;
  };
  children: FakeEl[];
  listeners: Record<string, Array<(e: any,) => void>>;
  querySelector: (sel: string,) => FakeEl | null;
  addEventListener: (_type: string, _fn: (e: any,) => void,) => void;
  dispatchEvent: (e: any,) => void;
  files: any;
  textContent: string;
};

function makeEl(tag: string, id = "",): FakeEl {
  const listeners: Record<string, Array<(e: any,) => void>> = {};
  const classSet = new Set<string>();
  const el: FakeEl = {
    tagName: tag.toUpperCase(),
    id,
    type: tag === "input" ? "text" : "",
    classList: {
      _set: classSet,
      add: (c,) => classSet.add(c,),
      remove: (c,) => classSet.delete(c,),
      contains: (c,) => classSet.has(c,),
    },
    children: [],
    listeners,
    querySelector: () => null,
    addEventListener(type, fn,) {
      listeners[type] = listeners[type] ?? [];
      listeners[type].push(fn,);
    },
    dispatchEvent(e,) {
      for (const fn of listeners[e.type] ?? []) { fn(e,); }
    },
    files: undefined,
    textContent: "",
  };
  return el;
}

let dropZone: FakeEl;
let input: FakeEl;
let textEl: FakeEl | null = null;

const elements: Record<string, FakeEl> = {};

(globalThis as any).document = {
  querySelector(sel: string,): any {
    return elements[sel] ?? null;
  },
  createElement(tag: string,): any {
    return makeEl(tag,);
  },
  addEventListener(_type: string, _fn: any,) {
    // Auto-init subscription: ignore in tests
  },
};

(globalThis as any).CSS = { escape: (s: string,) => s, };

// ── Tests ───────────────────────────────────────────────────────────────────

describe("file validation (isAllowedType)", () => {
  test("accepts image/png", () => {
    expect(isAllowedType({ type: "image/png", },),).toBe(true,);
  });

  test("accepts image/jpeg", () => {
    expect(isAllowedType({ type: "image/jpeg", },),).toBe(true,);
  });

  test("accepts audio/mpeg", () => {
    expect(isAllowedType({ type: "audio/mpeg", },),).toBe(true,);
  });

  test("accepts audio/ogg", () => {
    expect(isAllowedType({ type: "audio/ogg", },),).toBe(true,);
  });

  test("accepts video/mp4", () => {
    expect(isAllowedType({ type: "video/mp4", },),).toBe(true,);
  });

  test("rejects application/pdf", () => {
    expect(isAllowedType({ type: "application/pdf", },),).toBe(false,);
  });

  test("rejects text/plain", () => {
    expect(isAllowedType({ type: "text/plain", },),).toBe(false,);
  });

  test("rejects empty mime type", () => {
    expect(isAllowedType({ type: "", },),).toBe(false,);
  });

  test("ALLOWED_TYPES includes image, audio, video prefixes", () => {
    expect(ALLOWED_TYPES,).toContain("image/",);
    expect(ALLOWED_TYPES,).toContain("audio/",);
    expect(ALLOWED_TYPES,).toContain("video/",);
  });
});

describe("initDropZone", () => {
  beforeEach(() => {
    // Set up DOM stubs
    dropZone = makeEl("div", "test-dropzone",);
    textEl = makeEl("span", "",);
    (textEl as any).className = "text";
    textEl.textContent = "Drag & drop files here";
    // Patch querySelector on the zone to return textEl
    dropZone.querySelector = (sel: string,) => (sel === ".text" ? textEl : null);

    input = makeEl("input", "test-file-input",);

    elements["#test-dropzone"] = dropZone;
    elements["#test-file-input"] = input;
  },);

  afterEach(() => {
    delete elements["#test-dropzone"];
    delete elements["#test-file-input"];
    textEl = null;
  },);

  test("returns early when zone not found", () => {
    delete elements["#test-dropzone"];
    expect(() => initDropZone("test-dropzone", "test-file-input",)).not.toThrow();
  });

  test("wires dragover to add 'drag-over' class", () => {
    initDropZone("test-dropzone", "test-file-input",);
    dropZone.dispatchEvent({ type: "dragover", preventDefault: () => {}, },);
    expect(dropZone.classList.contains("drag-over",),).toBe(true,);
  });

  test("wires dragleave to remove 'drag-over' class", () => {
    dropZone.classList.add("drag-over",);
    initDropZone("test-dropzone", "test-file-input",);
    dropZone.dispatchEvent({ type: "dragleave", preventDefault: () => {}, },);
    expect(dropZone.classList.contains("drag-over",),).toBe(false,);
  });

  test("drop with file updates text content with file name", () => {
    initDropZone("test-dropzone", "test-file-input",);
    const file = { name: "test.png", type: "image/png", };
    dropZone.dispatchEvent({
      type: "drop",
      preventDefault: () => {},
      dataTransfer: { files: [file,], },
    },);
    expect(textEl?.textContent,).toBe("test.png",);
  });

  test("drop with empty files does not change text", () => {
    initDropZone("test-dropzone", "test-file-input",);
    dropZone.dispatchEvent({
      type: "drop",
      preventDefault: () => {},
      dataTransfer: { files: [], },
    },);
    expect(textEl?.textContent,).toBe("Drag & drop files here",);
  });

  test("input change updates text to filename", () => {
    initDropZone("test-dropzone", "test-file-input",);
    const file = { name: "changed.txt", type: "text/plain", };
    input.files = [file,];
    input.dispatchEvent({ type: "change", preventDefault: () => {}, },);
    expect(textEl?.textContent,).toBe("changed.txt",);
  });

  test("input change with no file resets text", () => {
    initDropZone("test-dropzone", "test-file-input",);
    input.files = [];
    input.dispatchEvent({ type: "change", preventDefault: () => {}, },);
    expect(textEl?.textContent,).toBe("Drag & drop files here",);
  });
});
