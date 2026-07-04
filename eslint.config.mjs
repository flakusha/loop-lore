// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ESLint flat config — TypeScript + Unicorn + SonarJS + Prettier
// https://eslint.org/docs/latest/use/configure/configuration-files
// https://typescript-eslint.io/getting-started/typed-linting

import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import unicorn from "eslint-plugin-unicorn";
import sonarjs from "eslint-plugin-sonarjs";
import globals from "globals";
import prettier from "eslint-config-prettier";
import markdown from "eslint-plugin-markdown";

const projectRoot = import.meta.dirname;

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
      "migrations/",
      "bun.lock",
      "*.har",
    ],
  },

  // ── Markdown files: extract & lint code blocks ────────────────
  ...markdown.configs.recommended,
  {
    files: ["**/*.md/**"],
    rules: {
      // Code blocks inside docs — valid JavaScript/TypeScript patterns
      "no-undef": "off", // Markdown snippets reference undeclared vars intentionally
      "no-unused-vars": "off",
      "no-unused-expressions": "off",
      "padded-blocks": "off",
      "eol-last": "off",
      // Prettier conflicts
      ...prettier.rules,
    },
  },

  // ── TypeScript source files: full TS + Unicorn + SonarJS ───────
  {
    files: ["src/**/*.ts"],
    extends: [
      // ESLint recommended rules
      eslint.configs.recommended,
      // TypeScript strict + stylistic type-checked rules
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
    plugins: {
      unicorn: unicorn.configs["flat/recommended"].plugins.unicorn,
      sonarjs: sonarjs.configs.recommended.plugins.sonarjs,
    },
    rules: {
      // ── Unicorn: opinionated quality-of-life rules ──────────
      ...unicorn.configs["flat/recommended"].rules,

      // Allow pragmatic patterns common in this codebase
      "unicorn/prefer-module": "off",
      "unicorn/prevent-abbreviations": "off",
      "unicorn/no-null": "off",
      "unicorn/no-array-reduce": "off",
      // Conflicts with @typescript-eslint/no-non-null-assertion when using .at(-1)!
      "unicorn/prefer-at": "off",
      // Name replacements rule is too aggressive - doesn't improve readability
      "unicorn/name-replacements": "off",
      // Boolean naming convention is too opinionated for game logic fields
      // (defeated, hidden, completed, etc. are perfectly readable RPG terminology)
      "unicorn/consistent-boolean-name": "off",

      // Enforce kebab-case filenames (with PascalCase exceptions for classes, snake_case for migrations)
      "unicorn/filename-case": [
        "warn",
        { cases: { kebabCase: true, pascalCase: true, snakeCase: true }, multipleFileExtensions: false },
      ],
      // Prefer module-scoped functions when possible
      "unicorn/consistent-function-scoping": "warn",
      // Error classes must be properly named
      "unicorn/custom-error-definition": "error",
      // Must use `new` with Error
      "unicorn/throw-new-error": "error",
      // Avoid `(await x).foo` — assign to variable first
      "unicorn/no-await-expression-member": "error",
      // Switch cases must use braces
      "unicorn/switch-case-braces": ["error", "always"],
      "unicorn/no-unnecessary-await": "error",
      // Track TODO expiry
      "unicorn/expiring-todo-comments": "warn",
      // Prefer top-level await over async IIFE
      "unicorn/prefer-top-level-await": "error",
      // Catch param should be named `error`
      "unicorn/catch-error-name": ["error", { name: "error" }],
      // Prefer optional catch binding when binding unused
      "unicorn/prefer-optional-catch-binding": "error",
      // Prefer node: protocol for built-ins
      "unicorn/prefer-node-protocol": "error",
      // Prefer default import style
      "unicorn/import-style": "off", // Too noisy for Node built-in imports
      // CLI apps legitimately use process.exit() (TUI, migrate)
      "unicorn/no-process-exit": "off",

      // ── SonarJS: code smell & bug detection ────────────────
      ...sonarjs.configs.recommended.rules,

      // Disable rules that overlap or conflict with TypeScript/Unicorn
      "sonarjs/no-duplicate-string": "off",
      "sonarjs/todo-tag": "off",
      "sonarjs/function-return-type": "off",
      "sonarjs/argument-type": "off",
      "sonarjs/no-empty-function": "off",
      "sonarjs/unused-import": "off", // Covered by @typescript-eslint/no-unused-vars

      // Keep these on — they catch real bugs
      "sonarjs/no-ignored-return": "warn",
      "sonarjs/no-identical-conditions": "error",
      "sonarjs/no-identical-functions": "warn",
      "sonarjs/no-inverted-boolean-check": "error",
      "sonarjs/no-empty-collection": "error",
      "sonarjs/prefer-single-boolean-return": "warn",
      "sonarjs/prefer-immediate-return": "warn",

      // ── TypeScript overrides ───────────────────────────────
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // Allow template literal expressions of any type
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true, allowBoolean: true, allowAny: false, allowNullish: true },
      ],
      // Resolve conflict between strict rules:
      // no-non-null-assertion bans `!`, non-nullable-type-assertion-style prefers `!`
      // We side with no-non-null-assertion (stricter)
      "@typescript-eslint/non-nullable-type-assertion-style": "off",

      // ── Prettier: disable conflicting rules ────────────────
      ...prettier.rules,
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
    },
  },

  // ── Overrides: test files ─────────────────────────────────────
  // (future-proofing — no test files exist yet)
  {
    files: ["**/*.test.ts", "**/*.spec.ts", "**/__tests__/**/*.ts"],
    rules: {
      "sonarjs/no-identical-functions": "off",
      "unicorn/consistent-function-scoping": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "unicorn/no-await-expression-member": "off",
    },
  },
);
