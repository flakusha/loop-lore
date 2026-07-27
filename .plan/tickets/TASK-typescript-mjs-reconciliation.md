# TASK: TypeScript/MJS Reconciliation

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-logic-reconciliation

## Summary

Reconcile TypeScript/MJS patterns across the codebase. Align module configuration, import/export patterns, and build tooling with project conventions. Identify and fix inconsistencies between TypeScript config, ESLint config, and actual code patterns.

## Current State

### TypeScript Configuration

- **tsconfig.backend.json**: `"module": "ESNext"`, `"moduleResolution": "Bundler"`, `"verbatimModuleSyntax": true`
- **tsconfig.json**: Extends backend, adds `"lib": ["ES2024", "DOM", "DOM.Iterable"]`
- **Key settings**: `verbatimModuleSyntax: true` (forces `import type` for type-only imports), `noEmit: true` (Bun handles transpilation)

### ESLint Configuration

- **eslint.config.mjs**: Uses `.mjs` extension for ESM compatibility
- **Pattern**: `eslint.config.mjs` is the standard for ESLint flat config with ESM

### Code Patterns

- **vendor.ts**: Uses `require()` for htmx extensions (CJS required for side effects)
- **Import style**: Mix of `import type` (type-only) and regular imports
- **Module resolution**: Bun's bundler resolution handles TypeScript imports

## Identified Inconsistencies

### 1. Module Extension Mismatch

- **ESLint config**: `eslint.config.mjs` (explicit `.mjs`)
- **TypeScript config**: No `.mjs` files in `src/` (all `.ts`)
- **Issue**: `.mjs` extension is for JavaScript files, not TypeScript

### 2. Import Type Enforcement

- **Config**: `verbatimModuleSyntax: true` forces `import type` for type-only imports
- **Code**: Some files use regular `import` for type-only imports
- **Issue**: Potential type-only imports not using `import type` syntax

### 3. CJS vs ESM Mix

- **vendor.ts**: Uses `require()` for htmx extensions (CJS)
- **Config**: `verbatimModuleSyntax: true` (ESM-only)
- **Issue**: CJS `require()` in ESM context (Bun handles this, but inconsistent)

### 4. Build Target Mismatch

- **tsconfig**: `"target": "ES2024"` (modern JS)
- **package.json**: `"entryPoint": "src/server.ts"` (Bun runtime)
- **Issue**: Build targets should align with runtime capabilities

## Reconciliation Plan

### Phase 1: Audit & Document

- [ ] Audit all `.mjs` files in project root
- [ ] Audit `import type` usage across codebase
- [ ] Document CJS `require()` usage patterns
- [ ] Identify type-only imports not using `import type`

### Phase 2: Fix Import Patterns

- [ ] Convert type-only imports to `import type` syntax
- [ ] Document CJS `require()` exceptions (vendor.ts htmx extensions)
- [ ] Add ESLint rule for `import type` enforcement if missing

### Phase 3: Align Configurations

- [ ] Verify `verbatimModuleSyntax` is working correctly
- [ ] Check if `.mjs` extension is needed or can be renamed
- [ ] Align build targets with runtime capabilities

### Phase 4: Documentation

- [ ] Document TypeScript/MJS conventions in `docs/meta/code-practices-improvements/`
- [ ] Add to reconciliation plan in `TASK-reconciliation-plan.md`

## Acceptance Criteria

- [ ] All type-only imports use `import type` syntax
- [ ] CJS `require()` usage is documented and justified
- [ ] `.mjs` extension usage is consistent and intentional
- [ ] TypeScript config aligns with ESLint config
- [ ] Build targets align with runtime capabilities
- [ ] Documentation updated with conventions

## Risk

Low — this is documentation and minor syntax changes. No schema changes or logic modifications.

## Related

- `TASK-reconciliation-plan.md` — overall reconciliation plan
- `docs/meta/code-practices-improvements/01-strict-typing.md` — TypeScript strictness
- `docs/meta/code-practices-improvements/06-schemas-and-openapi.md` — schema reconciliation
- `eslint.config.mjs` — ESLint configuration
- `tsconfig.backend.json` — TypeScript configuration
