// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// tests/setup-globals.ts
//
// Browser globals for frontend Alpine tests.
// Loaded via bunfig.toml [test] preload — runs before any import.

// Redirect the production DB path to a tmpdir before any module imports `@/db`.
// The previous default of `<repo>/loop-lore-data/loop-lore.db` caused every test run
// to materialize a 2+ MB SQLite file in the repo (BUG-eager-db-init-creates-on-disk-db-on-test-import).
// Production callers go through `src/db/index.ts` which still defaults to DATA_DIR for the
// actual server, so this only affects test workers.
if (typeof process !== "undefined" && !process.env.LOOP_LORE_DB_PATH) {
  const { tmpdir, } = await import("node:os");
  const { join, } = await import("node:path");
  process.env.LOOP_LORE_DB_PATH = join(tmpdir(), `loop-lore-test-${process.pid}-${Date.now()}.db`,);
}
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
