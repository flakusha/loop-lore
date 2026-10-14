import { defineConfig, } from "oxlint";

export default defineConfig({
  "plugins": ["typescript", "unicorn", "import", "oxc",],
  "categories": {
    "correctness": "error",
    "suspicious": "warn",
    "perf": "warn",
    // NOTE: `style` is intentionally NOT enabled. It pulls in ~86k findings of
    // pure house-style disagreement (one-var, sort-keys, no-magic-numbers,
    // func-style, capitalized-comments, ...) that this codebase deliberately does
    // not follow. ESLint (eslint.config.mjs) owns house style; oxlint owns bug
    // catching. correctness/suspicious/perf are unchanged.
  },
  // Rules pinned to `off` so re-enabling a category can never resurrect them.
  // None of these are `correctness` rules; all report at `warn` today. Each is
  // a house-style disagreement with the codebase as written.
  "rules": {
    "eslint/no-underscore-dangle": "off", // deliberate `__GLOBAL` frontend convention
    "unicorn/no-null": "off", // codebase returns `T | null` everywhere
    "import/no-named-export": "off", // named exports are the house style
    "import/group-exports": "off",
    "import/exports-last": "off",
    "import/prefer-default-export": "off",
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
    "src/frontend/vendor/**",
  ],
  "env": {
    "builtin": true,
  },
},);
