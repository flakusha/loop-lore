// ── Theme definitions ──────────────────────────────────────

const THEMES = [
  { id: "default", name: "Default (Dark)", file: "theme-default.css" },
  { id: "light", name: "Light", file: "theme-light.css" },
  { id: "bright", name: "Bright", file: "theme-bright.css" },
  { id: "colorful", name: "Colorful", file: "theme-colorful.css" },
  { id: "monochrome", name: "Monochrome", file: "theme-monochrome.css" },
  { id: "no-icons", name: "No Icons", file: "theme-no-icons.css" },
  { id: "dracula", name: "Dracula", file: "theme-dracula.css" },
  { id: "nord", name: "Nord", file: "theme-nord.css" },
  { id: "github-dark", name: "GitHub Dark", file: "theme-github-dark.css" },
  { id: "material", name: "Material", file: "theme-material.css" },
];

// Attach to globalThis so Bun bundler doesn't inline/drop the const
globalThis.__THEMES = THEMES;

