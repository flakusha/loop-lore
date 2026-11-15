// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/assistant/commands/doctor.ts
//
// /doctor — render the setup-state checks as guided setup output.
//
// Read-only: reports `setupChecks` (the same module the setup-state endpoint
// and the boot readiness line consume), changes nothing. SECRET RULE: output
// carries check ids + ok/off + static next steps only — the raw `hint` text
// is never rendered, because provider errors and thrown messages can carry
// paths or secret-adjacent values.

import { MIN_PII_SECRET_LENGTH, } from "../../config/load/pii-safety";
import { type SetupCheck, setupChecks, } from "../../routes/setup/checks";
import { type CommandResult, registerCommand, } from "./registry";

/**
 * Operator-safe next step per stable check id. Static text on purpose: never
 * interpolated with env values, probe errors, or filesystem paths.
 */
const NEXT_STEPS: Record<string, string> = {
  "env.pii": `Set the PII secret env vars to at least ${MIN_PII_SECRET_LENGTH} characters (openssl rand -base64 48).`,
  "provider.health": "Connect at least one provider in the admin provider settings, then re-run /doctor.",
  "smk": "Set SERVER_ENCRYPTION_KEY and restart so message encryption activates.",
  "model.roles": "Point the main model role at a configured provider and model.",
  "native": "Native module unavailable — the pure-JS fallback is active; no action required.",
  "tls": "Set the TLS key/certificate paths in server config to enable TLS.",
};

/** Guidance for a check id the map does not know yet (never the raw hint). */
const FALLBACK_STEP = "See GET /api/v1/setup/state for details, then re-run /doctor.";

/**
 * Render setup checks as guided output: ids + ok/off + next steps only.
 * @param checks - The `setupChecks` probe results, in stable order
 * @returns Markdown block listing every check with guidance for the failing ones
 */
export function renderDoctorReport(checks: SetupCheck[],): string {
  const passed = checks.filter((check,) => check.ok).length;
  const lines = [`**Doctor:** ${passed} of ${checks.length} setup checks passing.`, "",];
  for (const check of checks) {
    if (check.ok) {
      lines.push(`- ✅ \`${check.id}\` — ok`,);
    } else {
      lines.push(`- ❌ \`${check.id}\` — off — ${NEXT_STEPS[check.id] ?? FALLBACK_STEP}`,);
    }
  }

  return lines.join("\n",);
}

registerCommand("doctor", async (_args, ctx,): Promise<CommandResult> => {
  if (!ctx.config) {
    return { systemMessage: "**Doctor unavailable:** no app config in command context.", handled: true, };
  }

  const checks = await setupChecks(ctx.config, ctx.db,);
  return { systemMessage: renderDoctorReport(checks,), handled: true, };
}, { capabilities: ["read-chat",], },);
