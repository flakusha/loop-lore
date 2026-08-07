// src/config/schema/frontend.ts — Frontend config type

export interface FrontendConfig {
  /** Frontend rendering mode: "htmx" for htmx partials (default), "spa" for single-page app, "none" for API-only */
  mode: "htmx" | "spa" | "none";
}
