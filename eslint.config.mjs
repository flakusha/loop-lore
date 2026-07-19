// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ESLint flat config — TypeScript + Unicorn + SonarJS + Prettier
// https://eslint.org/docs/latest/use/configure/configuration-files
// https://typescript-eslint.io/getting-started/typed-linting

import eslint from "@eslint/js";
import prettier from "eslint-config-prettier";
import importPlugin from "eslint-plugin-import";
import markdown from "eslint-plugin-markdown";
import sonarjs from "eslint-plugin-sonarjs";
import unicorn from "eslint-plugin-unicorn";
import globals from "globals";
import tseslint from "typescript-eslint";

const projectRoot = import.meta.dirname;

// Shared rules for all TS source files (server + frontend)
const tsPlugins = {
  "@typescript-eslint": tseslint.plugin,
  unicorn: unicorn.configs["flat/recommended"].plugins.unicorn,
  sonarjs: sonarjs.configs.recommended.plugins.sonarjs,
  import: importPlugin,
};

const tsRules = {
  // ── Unicorn shared overrides ───────────────────────────────
  ...unicorn.configs["flat/recommended"].rules,
  "unicorn/prefer-module": "off",
  "unicorn/prevent-abbreviations": "off",
  "unicorn/no-null": "off",
  "unicorn/no-array-reduce": "off",
  "unicorn/prefer-at": "off",
  "unicorn/name-replacements": "off",
  "unicorn/consistent-boolean-name": "off",
  "unicorn/filename-case": [
    "warn",
    { cases: { kebabCase: true, pascalCase: true, snakeCase: true }, multipleFileExtensions: false },
  ],
  "unicorn/consistent-function-scoping": "warn",
  "unicorn/custom-error-definition": "off",
  "unicorn/throw-new-error": "error",
  "unicorn/no-await-expression-member": "error",
  "unicorn/switch-case-braces": ["error", "always"],
  "unicorn/no-unnecessary-await": "error",
  "unicorn/expiring-todo-comments": "warn",
  "unicorn/prefer-top-level-await": "error",
  "unicorn/catch-error-name": ["error", { name: "error" }],
  "unicorn/prefer-optional-catch-binding": "error",
  "unicorn/import-style": "off",
  "unicorn/no-top-level-side-effects": "off",
  "unicorn/consistent-class-member-order": "off",
  "unicorn/no-array-sort": "off",
  "unicorn/no-array-reverse": "off",
  "unicorn/prefer-iterator-to-array": "off",
  "unicorn/no-break-in-nested-loop": "off",
  "unicorn/no-immediate-mutation": "off",
  "unicorn/isolated-functions": "off",
  "unicorn/no-incorrect-query-selector": "off",
  "unicorn/prefer-spread": "off",
  "unicorn/prefer-string-raw": "off",

  // ── SonarJS shared overrides ───────────────────────────────
  ...sonarjs.configs.recommended.rules,
  "sonarjs/no-duplicate-string": "off",
  "sonarjs/todo-tag": "off",
  "sonarjs/function-return-type": "off",
  "sonarjs/argument-type": "off",
  "sonarjs/no-empty-function": "off",
  "sonarjs/unused-import": "off",
  "sonarjs/no-unused-vars": "off",
  "sonarjs/deprecation": "off",
  "sonarjs/regex-complexity": "off",
  "sonarjs/no-ignored-return": "warn",
  "sonarjs/no-identical-conditions": "error",
  "sonarjs/no-identical-functions": "off",
  "sonarjs/no-inverted-boolean-check": "error",
  "sonarjs/no-empty-collection": "error",
  "sonarjs/prefer-single-boolean-return": "warn",
  "sonarjs/prefer-immediate-return": "warn",
  "sonarjs/no-nested-conditional": "off",
  "sonarjs/assertions-in-tests": "off",
  "sonarjs/no-dead-store": "off",
  "sonarjs/no-misleading-array-reverse": "off",
  "sonarjs/pseudo-random": "off",
  "sonarjs/no-undefined-argument": "off",
  "sonarjs/no-alphabetical-sort": "off",
  "sonarjs/no-all-duplicated-branches": "off",
  "sonarjs/fixme-tag": "off",
  "sonarjs/duplicates-in-character-class": "off",
  "sonarjs/different-types-comparison": "off",
  "sonarjs/no-os-command-from-path": "off",
  "sonarjs/super-linear-regex": "off",
  "sonarjs/prefer-regexp-exec": "off",
  "sonarjs/publicly-writable-directories": "off",
  "preserve-caught-error": "off",

  // ── TypeScript shared overrides ────────────────────────────
  "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
  "@typescript-eslint/non-nullable-type-assertion-style": "off",
  "@typescript-eslint/no-confusing-void-expression": "off",
  "@typescript-eslint/await-thenable": "off",
  "@typescript-eslint/no-non-null-assertion": "off",
  "@typescript-eslint/prefer-nullish-coalescing": "off",
  "@typescript-eslint/no-unnecessary-condition": "off",
  "@typescript-eslint/use-unknown-in-catch-callback-variable": "off",
  "@typescript-eslint/consistent-type-definitions": ["error", "interface"],
  "@typescript-eslint/no-misused-promises": "error",

  // ── Complexity ceiling ─────────────────────────────────────
  "sonarjs/cognitive-complexity": ["warn", 20],

  // ── Import hygiene ─────────────────────────────────────────
  "import/no-cycle": ["error", { maxDepth: 1 }],
  "import/first": "error",
  "import/no-mutable-exports": "error",

  // ── Low-value rules generating noise from Elysia/Kysely patterns ──
  "@typescript-eslint/no-unsafe-member-access": "off",
  "@typescript-eslint/no-unsafe-assignment": "off",
  "@typescript-eslint/no-unsafe-call": "off",
  "@typescript-eslint/no-unsafe-argument": "off",
  "@typescript-eslint/no-unsafe-return": "off",
  "@typescript-eslint/no-explicit-any": "off",

  // ── Low-value unicorn style rules ────────────────────────────
  "unicorn/no-declarations-before-early-exit": "off",
  "unicorn/no-top-level-assignment-in-function": "off",
  "unicorn/prefer-number-coercion": "off",
  "unicorn/no-unnecessary-global-this": "off",
  "unicorn/prefer-number-properties": "off",
  "unicorn/no-computed-property-existence-check": "off",
  "unicorn/prefer-else-if": "off",
  "unicorn/prefer-code-point": "off",
  "unicorn/no-useless-switch-case": "off",
  "unicorn/no-unnecessary-splice": "off",
  "unicorn/prefer-number-is-safe-integer": "off",
  "unicorn/prefer-object-iterable-methods": "off",
  "unicorn/consistent-optional-chaining": "off",
  "unicorn/no-unnecessary-type-conversion": "off",
  "unicorn/no-redundant-jump": "off",
  "sonarjs/no-redundant-jump": "off",
  "unicorn/no-unsafe-string-replacement": "warn",
  "unicorn/require-array-sort-compare": "warn",
  "unicorn/prefer-await": "warn",
  "@typescript-eslint/require-await": "warn",
  "no-empty": "warn",
  "@typescript-eslint/no-empty-function": "warn",
  "@typescript-eslint/no-floating-promises": "off",

  // ── Prettier ───────────────────────────────────────────────
  ...prettier.rules,
};

export default tseslint.config(
  // ── Global ignores ──────────────────────────────────────────────
  {
    ignores: [
      "dist/",
      "node_modules/",
      "data/",
      ".tmp/",
      ".hermes/",
      "docs/.vitepress/",
      "docs/research/",
      "migrations/",
      "plugins/",
      "tree/",
      "bun.lock",
      "*.har",
    ],
  },
  // ── Markdown files: extract & lint code blocks ─────────────────
  ...markdown.configs.recommended,
  {
    files: ["**/*.md/**"],
    rules: {
      "no-undef": "off",
      "no-unused-vars": "off",
      "no-unused-expressions": "off",
      "padded-blocks": "off",
      "eol-last": "off",
      ...prettier.rules,
    },
  },
  // ── Server TypeScript: Bun/Node env, full type-checked rules ───
  {
    files: ["src/**/*.ts"],
    ignores: ["src/frontend/**/*.ts"],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: projectRoot,
      },
      globals: {
        ...globals.bun,
        ...globals.node,
      },
    },
    plugins: tsPlugins,
    rules: {
      ...tsRules,
      "unicorn/prefer-node-protocol": "error",
      "unicorn/no-process-exit": "off",
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true, allowBoolean: true, allowAny: false, allowNullish: true },
      ],
    },
  },
  // ── Frontend TypeScript: Browser env, DOM-lib tsconfig ─────────
  {
    files: ["src/frontend/**/*.ts"],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: "tsconfig.frontend.json",
        tsconfigRootDir: projectRoot,
      },
      globals: {
        ...globals.browser,
        apiFetch: "readonly",
        THEMES: "readonly",
        showToast: "readonly",
        closeSidebar: "readonly",
        toggleSidebar: "readonly",
        applyTheme: "readonly",
        setLocale: "readonly",
        __: "readonly",
        __THEMES: "readonly",
        __localeStrings: "readonly",
        Alpine: "readonly",
        htmx: "readonly",
        require: "readonly",
        chatState: "readonly",
        worldEditState: "readonly",
      },
    },
    plugins: tsPlugins,
    rules: {
      ...tsRules,
      "unicorn/prefer-node-protocol": "off",
      "unicorn/no-process-exit": "error",
      "unicorn/prefer-uint8array-base64": "off",
      "unicorn/no-this-outside-of-class": "off",
      "unicorn/no-global-object-property-assignment": "off",
      "no-unused-vars": "off",
      // Frontend Alpine/htmx globals are `any`-typed — relax template/expression rules
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true, allowBoolean: true, allowAny: true, allowNullish: true },
      ],
      "@typescript-eslint/restrict-plus-operands": "off",
      "@typescript-eslint/no-dynamic-delete": "off",
      // Alpine event handlers return promises silently
      "@typescript-eslint/no-misused-promises": "off",
      "@typescript-eslint/consistent-type-definitions": "off",
      // --fix for these removes type assertions that frontend relies on for globalThis access
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/array-type": "off",
      // Frontend DOM patterns
      "@typescript-eslint/prefer-regexp-exec": "off",
      "@typescript-eslint/no-unnecessary-type-conversion": "off",
    },
  },
  // ── E2E test TypeScript: Bun test env ──────────────────────
  {
    files: ["tests/e2e/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      globals: {
        ...globals.bun,
      },
    },
    plugins: tsPlugins,
    rules: {
      ...tsRules,
      "unicorn/no-this-outside-of-class": "off",
      "sonarjs/no-identical-functions": "off",
      "unicorn/consistent-function-scoping": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "unicorn/no-await-expression-member": "off",
      "@typescript-eslint/require-await": "off",
      // Type-aware rules require parserOptions.project — disabled here
      "@typescript-eslint/no-misused-promises": "off",
      "import/no-cycle": "off",
    },
  },
  // ── Config/JS files: no TS parser, just Unicorn + SonarJS ─────
  {
    files: ["**/*.mjs", "**/*.cjs", "**/*.js"],
    ignores: ["src/**/*.ts", "node_modules/**"],
    extends: [eslint.configs.recommended],
    plugins: {
      unicorn: unicorn.configs["flat/recommended"].plugins.unicorn,
      sonarjs: sonarjs.configs.recommended.plugins.sonarjs,
    },
    rules: {
      ...unicorn.configs["flat/recommended"].rules,
      ...sonarjs.configs.recommended.rules,
      ...prettier.rules,

      "unicorn/prefer-module": "off",
      "unicorn/prevent-abbreviations": "off",
      "unicorn/no-null": "off",
      "sonarjs/todo-tag": "off",
      "sonarjs/no-duplicate-string": "off",
      "sonarjs/no-empty-function": "off",
      "sonarjs/no-identical-functions": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // No TS parser — type-aware rules disabled
      "@typescript-eslint/no-misused-promises": "off",
      "@typescript-eslint/consistent-type-definitions": "off",
      "sonarjs/cognitive-complexity": "off",
      "import/no-cycle": "off",
    },
  },
  // ── Overrides: test files ─────────────────────────────────────
  {
    files: ["**/*.test.ts", "**/*.spec.ts", "**/__tests__/**/*.ts"],
    rules: {
      "sonarjs/no-identical-functions": "off",
      "unicorn/consistent-function-scoping": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "unicorn/no-await-expression-member": "off",
      "sonarjs/prefer-specific-assertions": "off",
      "unicorn/no-top-level-assignment-in-function": "off",
      "unicorn/no-declarations-before-early-exit": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "sonarjs/explicit-test-skip": "off",
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // ── Overrides: scripts (utility tools, relaxed rules) ─────────────────
  {
    files: ["src/scripts/**/*.ts"],
    rules: {
      "unicorn/text-encoding-identifier-case": "off",
      "unicorn/escape-case": "off",
      "unicorn/prefer-unicode-code-point-escapes": "off",
      "unicorn/prefer-node-protocol": "off",
      "unicorn/prefer-split-limit": "off",
      "unicorn/no-useless-template-literals": "off",
      "unicorn/prefer-string-raw": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/no-unnecessary-template-expression": "off",
      "@typescript-eslint/prefer-regexp-exec": "off",
      "unicorn/prefer-await": "off",
      "unicorn/prefer-top-level-await": "off",
      // Type-aware rules require parserOptions.project — disabled here
      "@typescript-eslint/no-misused-promises": "off",
      "import/no-cycle": "off",
    },
  },
);
