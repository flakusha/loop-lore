// src/config/schema-class/frontend.ts — frontend section defaults
import type { FrontendConfig, } from "../schema";

export const FRONTEND_DEFAULTS = {
  mode: "htmx" as const,
} satisfies FrontendConfig;
