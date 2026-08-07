// src/config/schema/index.ts — barrel for Config type definitions
//
// Re-exports the full public surface of the former src/config/schema.ts so
// existing `import ... from "../config/schema"` sites keep resolving.

export * from "./age-gate";
export * from "./assets";
export * from "./assistant";
export * from "./auth";
export * from "./auto-start";
export * from "./byo-key";
export * from "./characters";
export * from "./config";
export * from "./db";
export * from "./docs";
export * from "./dynamic-response";
export * from "./encryption";
export * from "./frontend";
export * from "./generation";
export * from "./headers";
export * from "./hooks";
export * from "./logging";
export * from "./messages";
export * from "./nsfw";
export * from "./providers";
export * from "./sd-provider";
export * from "./server";
export * from "./testing";
export * from "./transport";
export * from "./tui";

export type { TemplatesConfig, } from "../sections/templates";
