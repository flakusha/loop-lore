// tests/setup-globals.ts
//
// Browser globals for frontend Alpine tests.
// Loaded via bunfig.toml [test] preload — runs before any import.

if (typeof globalThis.document === "undefined") {
  (globalThis as any).document = {
    addEventListener: () => {},
    dispatchEvent: () => {},
    querySelector: () => null,
    createElement: (tag: string,) => ({
      style: {},
      value: "",
      tagName: tag.toUpperCase(),
      scrollHeight: 20,
    }),
  };
}

if (typeof globalThis.addEventListener === "undefined") {
  (globalThis as any).addEventListener = () => {};
}

if (typeof globalThis.CustomEvent === "undefined") {
  (globalThis as any).CustomEvent = class extends Event {
    detail: unknown;
    constructor(type: string, opts?: CustomEventInit,) {
      super(type, opts,);
      this.detail = opts?.detail;
    }
  };
}

if (typeof (globalThis as any).htmx === "undefined") {
  (globalThis as any).htmx = { process: () => {}, };
}

if (typeof (globalThis as any).Alpine === "undefined") {
  (globalThis as any).Alpine = { store: () => {}, initTree: () => {}, };
}
