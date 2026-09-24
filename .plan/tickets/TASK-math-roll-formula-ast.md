<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-math-roll-formula-ast — Generic formula AST for roll composition

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Summary:** Define a generic roll-formula AST (`Formula = Constant | DiceRef | Modifier | AdvExpr | Paren | BinaryOp`) so all roll resolvers (d20, 2d6, dice pool, custom) compose from the same parse → evaluate pipeline.
**Context:** `TASK-math-modifier-source-table` normalizes modifier provenance into rows; the next step is a unified formula AST so a roll like `2d6kh1 + 1d4 + STR` parses once and dispatches to the right resolver. Today each resolver parses its own input ad-hoc (regex splits, ad-hoc position math). A shared AST eliminates that duplication and makes "swap resolver for this chat" a runtime choice instead of a fork.
**Acceptance Criteria:** [ ] `src/rpg/interaction/formula/ast.ts` exports `Formula = Constant | DiceRef | Modifier | AdvExpr | Paren | BinaryOp` plus a typed `EvalContext`. [ ] `parseFormula("2d6kh1 + 1d4 + STR")` returns a `BinaryOp(Add, …)` AST, not a regex split. [ ] `evaluate(ast, ctx)` dispatches dice pool resolution, modifier lookup (`STR → ctx.modifiers.ability.str`), and advantage expressions. [ ] Resolver (`resolveInteraction`) accepts a `Formula` instead of a discriminated-union roll-kind payload; the legacy `rollKind` payload is shimmed for back-compat. [ ] Tests cover: parse round-trips, evaluate with empty context, evaluate with full context, parse errors include the offending span. [ ] `bun run check` green.
**Epic:** epic-math-resolution
**Tags:** rpg, math, formula, ast, dice, resolution


git issue: 92cb969
