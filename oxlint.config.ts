import { defineConfig, } from "oxlint";

export default defineConfig({
  "plugins": ["typescript", "unicorn", "import", "oxc",],
  "categories": {
    "correctness": "error",
    "suspicious": "warn",
    "perf": "warn",
    "style": "warn",
  },
  // NOTE: typeAware is intentionally omitted — type-aware rules fire many
  // unsafe-* errors on generated/Kysely/Elysia patterns. tsc handles type
  // checking. Enable only when needed: bunx oxlint --type-aware .
  "ignorePatterns": [
    "dist/**",
    "node_modules/**",
    "data/**",
    ".tmp/**",
    ".hermes/**",
    "docs/.vitepress/**",
    "docs/research/**",
    "migrations/**",
    "plugins/**",
    "tree/**",
    "bun.lock",
    "*.har",
    "*.example.*",
    ".github/templates/**",
    ".agents/**",
    "coverage/**",
    "scripts/worktree/**",
    "src/frontend/vendor/**",
  ],
  "env": {
    "builtin": true,
  },
},);
