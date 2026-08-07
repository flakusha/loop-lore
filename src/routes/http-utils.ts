// Thin wrapper for consumers that import with an explicit `.js` suffix
// (`./http-utils.js`). Bun resolves `.js → .ts` but not `.js → dir/index.ts`,
// so this file forwards to the directory barrel.
export * from "./http-utils/index.js";
