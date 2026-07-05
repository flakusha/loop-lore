/**
 * Generic State Machine Framework
 *
 * Single-axis state machines + multi-axis composite validation.
 * All enums in this codebase implement a StateDef.
 */

// ── Single-Axis State Machine ────────────────────────────

export interface StateDef<S extends string> {
  values: readonly S[];
  initial: S;
  transitions: Record<S, readonly S[]>;
  terminal: readonly S[];
}

// ── Transition Error ──────────────────────────────────────

export class TransitionError<S extends string> extends Error {
  // eslint-disable-next-line unicorn/custom-error-definition
  constructor(from: S, to: S) {
    super(`Invalid state transition: ${from} → ${to}`);
    this.name = "TransitionError";
  }
}

// ── State Machine Instance ────────────────────────────────

export class StateMachine<S extends string> {
  constructor(readonly def: StateDef<S>) {}

  canTransition(from: S, to: S): boolean {
    return (this.def.transitions[from] as readonly string[] | undefined)?.includes(to) ?? false;
  }

  transition(from: S, to: S): S {
    if (!this.canTransition(from, to)) {
      throw new TransitionError(from, to);
    }
    return to;
  }

  isTerminal(state: S): boolean {
    return (this.def.terminal as readonly string[]).includes(state);
  }

  isValid(state: S): boolean {
    return (this.def.values as readonly string[]).includes(state);
  }
}

// ── Multi-Axis Composite Validator ────────────────────────

export class CompositeValidator<A extends string, B extends string> {
  readonly allowed: ReadonlySet<string>;

  constructor(
    readonly axisA: StateMachine<A>,
    readonly axisB: StateMachine<B>,
    allowedPairs: readonly [`${A}:${B}`, ...`${A}:${B}`[]],
  ) {
    this.allowed = new Set(allowedPairs);
  }

  isValid(a: A, b: B): boolean {
    return this.allowed.has(`${a}:${b}`);
  }

  assertValid(a: A, b: B): void {
    if (!this.isValid(a, b)) {
      throw new Error(`Invalid composite state: ${a}:${b}`);
    }
  }
}

// ── Factory Helpers ───────────────────────────────────────

export function createMachine<S extends string>(def: StateDef<S>): StateMachine<S> {
  return new StateMachine(def);
}
