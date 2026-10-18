// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * VN Composite Template Execution
 *
 * Executes a composite template's `VnCompositeStep[]` sequentially: each
 * step's `templateId` is applied through an injectable `apply` callback,
 * steps whose `condition` evaluates false are skipped, and a step's `delay`
 * is awaited after that step before the next one runs ("ms before applying
 * next step", per the ticket's design).
 *
 * The condition grammar is a deliberately tiny, eval-free subset:
 * comparisons (`==`, `!=`, `<`, `<=`, `>`, `>=`) between literals (quoted
 * strings, numbers, `true`/`false`) and/or context variables, combined with
 * `&&`, `||` and parentheses. Anything unparseable or referring to an
 * unresolved variable evaluates to false — the step is skipped, never
 * thrown (matching apply.ts's fail-closed invariant).
 */

import type { VnCompositeStep, VnTemplate, } from "./template-engine";

/** One skipped step and why. */
export interface CompositeSkip {
  index: number;
  templateId: string;
  reason: "condition" | "unknown-template";
}

/** Outcome of a composite run. */
export interface CompositeRunResult {
  applied: number;
  skipped: CompositeSkip[];
}

/** Steps of `template` when it is a composite carrying at least one step. */
export function compositeStepsOf(template: VnTemplate | null | undefined,): VnCompositeStep[] | null {
  if (template?.category !== "composite") { return null; }
  const steps = template.body.steps;
  return Array.isArray(steps,) && steps.length > 0 ? steps : null;
}

// ── Condition evaluation (eval-free subset) ─────────────────

type Token =
  | { kind: "ident"; value: string }
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "op"; value: "==" | "!=" | "<" | "<=" | ">" | ">=" | "&&" | "||" }
  | { kind: "paren"; value: "(" | ")" };

const OPERATORS = ["==", "!=", "<=", ">=", "<", ">", "&&", "||",] as const;

/** Comparison operators only — logical operators compose at higher levels. */
type ComparisonOp = "==" | "!=" | "<" | "<=" | ">" | ">=";
type Primitive = string | number | boolean;

/** Tokenize a condition; null on any character outside the grammar. */
function tokenize(input: string,): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i]!;
    if (ch === " " || ch === "\t") {
      i++;
      continue;
    }

    if (ch === "(" || ch === ")") {
      tokens.push({ kind: "paren", value: ch, },);
      i++;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const end = input.indexOf(ch, i + 1,);
      if (end === -1) { return null; }
      tokens.push({ kind: "string", value: input.slice(i + 1, end,), },);
      i = end + 1;
      continue;
    }

    const op = OPERATORS.find((candidate,) => input.startsWith(candidate, i,));
    if (op) {
      tokens.push({ kind: "op", value: op, },);
      i += op.length;
      continue;
    }

    if (/[0-9]/.test(ch,) || (ch === "-" && /[0-9]/.test(input[i + 1] ?? "",))) {
      const match = /^-?[0-9]+(\.[0-9]+)?/.exec(input.slice(i,),);
      if (!match) { return null; }
      tokens.push({ kind: "number", value: Number(match[0],), },);
      i += match[0].length;
      continue;
    }

    if (/[A-Za-z_]/.test(ch,)) {
      const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(input.slice(i,),);
      if (!match) { return null; }
      tokens.push({ kind: "ident", value: match[0], },);
      i += match[0].length;
      continue;
    }

    return null;
  }

  return tokens;
}

/** Resolve an identifier against the context; undefined when absent. */
function lookup(context: Record<string, unknown>, name: string,): Primitive | undefined {
  if (name === "true") { return true; }
  if (name === "false") { return false; }
  const value = context[name];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  return undefined;
}

/**
 * Compare two primitives; null when the comparison is not well-typed
 * (unresolved operand, or ordering across mismatched/non-orderable types).
 */
function compare(
  left: Primitive | undefined,
  op: ComparisonOp,
  right: Primitive | undefined,
): boolean | null {
  if (left === undefined || right === undefined) { return null; }
  switch (op) {
    case "==":
      return left === right;
    case "!=":
      return left !== right;
    case "<":
    case "<=":
    case ">":
    case ">=": {
      // Ordering only over two numbers or two strings — never booleans and
      // never across types.
      if (typeof left !== typeof right || typeof left === "boolean") { return null; }
      if (op === "<") { return left < right; }
      if (op === "<=") { return left <= right; }
      if (op === ">") { return left > right; }
      return left >= right;
    }
  }
}

/**
 * Evaluate a composite step condition against the variable context.
 * @param condition Expression in the documented subset; empty/undefined is true.
 * @param context Variable values (scene `templateVars` + step overrides).
 * @returns false for any unparseable, mistyped, or unresolved comparison.
 */
export function evaluateCondition(
  condition: string | undefined,
  context: Record<string, unknown>,
): boolean {
  if (condition === undefined || condition.trim() === "") { return true; }

  const tokens = tokenize(condition,);
  if (!tokens || tokens.length === 0) { return false; }

  let pos = 0;

  const parseOr = (): boolean | null => {
    let left = parseAnd();
    while (left !== null && tokens[pos]?.kind === "op" && tokens[pos]?.value === "||") {
      pos++;
      const right = parseAnd();
      left = right === null ? null : left || right;
    }

    return left;
  };

  const parseAnd = (): boolean | null => {
    let left = parseComparison();
    while (left !== null && tokens[pos]?.kind === "op" && tokens[pos]?.value === "&&") {
      pos++;
      const right = parseComparison();
      left = right === null ? null : left && right;
    }

    return left;
  };

  const parseComparison = (): boolean | null => {
    const leftValue = parseOperand();
    if (leftValue === null) { return null; }
    const op = tokens[pos];
    if (op?.kind !== "op" || op.value === "&&" || op.value === "||") {
      // A bare boolean operand (variable or boolean literal) is its own
      // truth; strings/numbers/unresolved variables cannot stand alone.
      return typeof leftValue === "boolean" ? leftValue : null;
    }

    pos++;
    const rightValue = parseOperand();
    if (rightValue === null) { return null; }
    return compare(leftValue, op.value, rightValue,);
  };

  const parseOperand = (): Primitive | undefined | null => {
    const token = tokens[pos];
    if (!token) { return null; }
    if (token.kind === "paren" && token.value === "(") {
      pos++;
      const inner = parseOr();
      const close = tokens[pos];
      if (inner === null || close?.kind !== "paren" || close.value !== ")") { return null; }
      pos++;
      // A parenthesised group must be boolean to compose with && / ||.
      return inner ? true : false;
    }

    pos++;
    if (token.kind === "string" || token.kind === "number") { return token.value; }
    if (token.kind === "ident") { return lookup(context, token.value,); }
    return null;
  };

  const result = parseOr();
  return result === true && pos === tokens.length;
}

// ── Step executor ───────────────────────────────────────────

/**
 * Run composite steps in order. `apply` resolves and applies a step's
 * template; returning false records the step as skipped
 * (`unknown-template`). Each applied step's `delay` (when a positive finite
 * number) is awaited before the next step runs.
 * @param opts.steps Steps to execute.
 * @param opts.context Variables for condition evaluation and substitution.
 * @param opts.apply Applies one step's template; false = unknown template id.
 * @param opts.wait Delay injector; defaults to real `setTimeout` sleeping.
 * @returns Applied count and skip record.
 */
export async function executeCompositeSteps(opts: {
  steps: VnCompositeStep[];
  context: Record<string, unknown>;
  apply: (step: VnCompositeStep,) => boolean;
  wait?: (ms: number,) => Promise<void>;
},): Promise<CompositeRunResult> {
  const wait = opts.wait ?? defaultWait;
  const result: CompositeRunResult = { applied: 0, skipped: [], };

  for (const [index, step,] of opts.steps.entries()) {
    if (!evaluateCondition(step.condition, opts.context,)) {
      result.skipped.push({ index, templateId: step.templateId, reason: "condition", },);
      continue;
    }

    if (!opts.apply(step,)) {
      result.skipped.push({ index, templateId: step.templateId, reason: "unknown-template", },);
      continue;
    }

    result.applied++;
    if (typeof step.delay === "number" && Number.isFinite(step.delay,) && step.delay > 0) {
      await wait(step.delay,);
    }
  }

  return result;
}

/** Real-time wait used when no `wait` injector is supplied. */
function defaultWait(ms: number,): Promise<void> {
  const { promise, resolve, } = Promise.withResolvers<void>();
  setTimeout(resolve, ms,);
  return promise;
}
