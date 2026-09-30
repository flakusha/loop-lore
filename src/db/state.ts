// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Generic State Machine Framework
 *
 * Single-axis state machines + multi-axis composite validation.
 * All enums in this codebase implement a StateDef.
 */

// ── Single-Axis State Machine ────────────────────────────

/** */
export interface StateDef<S extends string,> {
  values: readonly S[];
  initial: S;
  transitions: Record<S, readonly S[]>;
  terminal: readonly S[];
}

// ── Transition Error ──────────────────────────────────────

/** */
export class TransitionError<S extends string,> extends Error {
  /**
   * @param from
   * @param to
   */
  constructor(from: S, to: S,) {
    super(`Invalid state transition: ${from} → ${to}`,);
    this.name = "TransitionError";
  }
}

// ── State Machine Instance ────────────────────────────────

/** */
export class StateMachine<S extends string,> {
  /**
   * @param def
   */
  constructor(readonly def: StateDef<S>,) {}

  /**
   * @param from - current state
   * @param to - proposed next state
   * @returns `true` when `to` is reachable from `from` per the transition table.
   */
  canTransition(from: S, to: S,): boolean {
    return (this.def.transitions[from] as readonly string[] | undefined)?.includes(to,) ?? false;
  }

  /**
   * @param from - current state
   * @param to - proposed next state
   * @returns `to` when the transition is allowed.
   * @throws {TransitionError} when `to` is not in `from`'s allowed transitions.
   */
  transition(from: S, to: S,): S {
    if (!this.canTransition(from, to,)) {
      throw new TransitionError(from, to,);
    }
    return to;
  }

  /**
   * @param state - state to check
   * @returns `true` when `state` is in the terminal set (no outgoing transitions).
   */
  isTerminal(state: S,): boolean {
    return (this.def.terminal as readonly string[]).includes(state,);
  }

  /**
   * @param state - state to validate
   * @returns `true` when `state` is a known value in the machine definition.
   */
  isValid(state: S,): boolean {
    return (this.def.values as readonly string[]).includes(state,);
  }
}

// ── Multi-Axis Composite Validator ────────────────────────

/** */
export class CompositeValidator<A extends string, B extends string,> {
  readonly allowed: ReadonlySet<string>;

  /**
   * @param axisA
   * @param axisB
   * @param allowedPairs
   */
  constructor(
    readonly axisA: StateMachine<A>,
    readonly axisB: StateMachine<B>,
    allowedPairs: readonly [`${A}:${B}`, ...`${A}:${B}`[],],
  ) {
    this.allowed = new Set(allowedPairs,);
  }

  /**
   * @param a - value on axis A
   * @param b - value on axis B
   * @returns `true` when `${a}:${b}` is in the allowed-pairs set.
   */
  isValid(a: A, b: B,): boolean {
    return this.allowed.has(`${a}:${b}`,);
  }

  /**
   * @param a - value on axis A
   * @param b - value on axis B
   * @throws {Error} `Invalid composite state: ${a}:${b}` when the pair is not in the allowed set.
   */
  assertValid(a: A, b: B,): void {
    if (!this.isValid(a, b,)) {
      throw new Error(`Invalid composite state: ${a}:${b}`,);
    }
  }
}

// ── Factory Helpers ───────────────────────────────────────

/**
 * @param def - StateDef describing values, transitions, and terminal states
 * @returns a `StateMachine` bound to `def`.
 */
export function createMachine<S extends string,>(def: StateDef<S>,): StateMachine<S> {
  return new StateMachine(def,);
}
