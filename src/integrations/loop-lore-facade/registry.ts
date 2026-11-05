// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/integrations/loop-lore-facade/registry.ts — the facade op registry and
// the runFacadeOp composition root (authz -> rate budget -> handler -> audit).
// Result-shape precedent: src/integrations/registry.ts (RegisterError).

import { toErrorMessage, } from "../../utils";
import { writeFacadeAudit, } from "./audit";
import { authorizeFacadeOp, } from "./authz";
import { consumeFacadeBudget, } from "./rate-limit";
import type { FacadeContext, FacadeOp, FacadeOpDescriptor, FacadeResult, } from "./types";

/** Failure of `register` — the op name is already taken. */
export interface FacadeRegisterError {
  ok: false;
  code: "duplicate_name";
  message: string;
  /** Op currently registered under the name. */
  readonly existing: FacadeOp;
}

/** Result of `register`. */
export type FacadeRegisterResult = { ok: true } | FacadeRegisterError;

/** The op directory the future MCP/ACP servers route through. */
export interface FacadeRegistry {
  register(op: FacadeOp,): FacadeRegisterResult;
  resolve(name: string,): FacadeOp | undefined;
  /** Discovery surface: descriptors WITHOUT handler internals. */
  manifest(): FacadeOpDescriptor[];
}

/** Build an empty {@link FacadeRegistry}.
 * @returns The registry.
 */
export function createFacadeRegistry(): FacadeRegistry {
  const ops = new Map<string, FacadeOp>();

  return {
    register(op,): FacadeRegisterResult {
      const existing = ops.get(op.name,);
      if (existing) {
        return {
          ok: false,
          code: "duplicate_name",
          message: `facade op "${op.name}" is already registered`,
          existing,
        };
      }

      ops.set(op.name, op,);
      return { ok: true, };
    },

    resolve(name,): FacadeOp | undefined {
      return ops.get(name,);
    },

    manifest(): FacadeOpDescriptor[] {
      return [...ops.values(),].map((op,) => ({
        name: op.name,
        domain: op.domain,
        summary: op.summary,
        description: op.description,
        scope: op.scope,
      }));
    },
  };
}

/**
 * Normalize a wrapped service's Response into a {@link FacadeResult}.
 * @param res - the Response the wrapped handler/service returned
 * @returns the parsed JSON body (null on non-JSON bodies) with status
 */
export async function facadeResultFromResponse(res: Response,): Promise<FacadeResult> {
  const json: unknown = await res.json().catch(() => null);
  return { ok: res.status < 400, status: res.status, json, };
}

/**
 * Run one facade op through the full lifecycle: resolve -> authorize ->
 * rate budget -> handler -> audit row. Handler throws are normalized to a
 * 500 FacadeResult; the audit row records the final status either way.
 * @param registry - the op registry
 * @param ctx - the facade context (server-resolved principal inside)
 * @param name - the op name
 * @param body - the caller body; op schemas/handlers own its interpretation
 * @returns the op's FacadeResult, or the lifecycle rejection
 */
export async function runFacadeOp(
  registry: FacadeRegistry,
  ctx: FacadeContext,
  name: string,
  body: unknown,
): Promise<FacadeResult> {
  const op = registry.resolve(name,);
  if (!op) {
    return {
      ok: false,
      status: 404,
      json: { error: "unknown_facade_op", message: `no facade op registered as "${name}"`, },
    };
  }

  const authzFailure = authorizeFacadeOp(ctx, op,);
  if (authzFailure) { return authzFailure; }

  // Budget bucket keyed on PRINCIPAL IDENTITY: an integration token gets its
  // OWN bucket (its credential id) so two tokens of one admin never share a
  // budget; JWT users key on their userId exactly as before.
  const budget = consumeFacadeBudget({
    key: ctx.principal.credentialId ?? ctx.principal.userId ?? "anonymous",
    policy: op.ratePolicy,
  },);

  if (!budget.allowed) {
    return {
      ok: false,
      status: 429,
      json: {
        error: "rate_limited",
        message: `facade budget exhausted for "${name}"; retry after ${budget.retryAfterSec}s`,
      },
    };
  }

  let result: FacadeResult;
  try {
    result = await op.handler(ctx, body,);
  } catch (error) {
    result = {
      ok: false,
      status: 500,
      json: { error: "facade_op_failed", message: toErrorMessage(error,), },
    };
  }

  await writeFacadeAudit(ctx.database, {
    op: name,
    domain: op.domain,
    scope: op.scope,
    status: result.status,
    principal: ctx.principal,
    requestId: ctx.requestId,
  },);

  return result;
}
