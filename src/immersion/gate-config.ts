// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Immersion Gate — per-chat config resolution (WI-6).
 *
 * Per-chat severity + per-rule toggles live in `chats.gm_config` under the
 * `immersionGate` key (the assistantTuning pattern: chat JSON column,
 * single-source defaults, permissive write path). Unknown rule ids and
 * illegal severities are dropped, never guessed; valid entries merge over
 * {@link DEFAULT_IMMERSION_CONFIG}.
 */
import { jsonParseOr, } from "../utils";
import type { ImmersionGateConfig, ImmersionRuleConfig, } from "./types";
import { DEFAULT_IMMERSION_CONFIG, GATE_RULE_ORDER, GateSeverity, } from "./types";

/** The per-chat override shape inside `gm_config.immersionGate`. */
export interface ImmersionGateOverride {
  readonly rules?: Readonly<Record<string, ImmersionRuleConfig | undefined>>;
}

/** Legal severity vocabulary (single source: the GateSeverity values). */
const SEVERITIES: readonly string[] = [
  GateSeverity.Allow,
  GateSeverity.Annotate,
  GateSeverity.SoftRefuse,
  GateSeverity.HardBlock,
];

/** Known rule ids (single source: GATE_RULE_ORDER). */
const KNOWN_RULES: ReadonlySet<string> = new Set(GATE_RULE_ORDER,);

/**
 * Resolve the effective gate config for a chat: defaults merged with the
 * per-chat override from `gm_config` (undefined when the chat carries no
 * valid override — callers then use their own config/default).
 * @param {string | null} gmConfig Raw `chats.gm_config` JSON.
 * @param {ImmersionGateConfig} [base] Config to merge over (defaults when omitted).
 * @returns {ImmersionGateConfig | undefined} Merged config, or undefined when no override applies.
 */
export function resolveImmersionGateConfig(
  gmConfig: string | null,
  base?: ImmersionGateConfig,
): ImmersionGateConfig | undefined {
  if (gmConfig === null || gmConfig.trim().length === 0) { return undefined; }
  const parsed = jsonParseOr<Record<string, unknown>>(gmConfig, {},);
  const override = parsed["immersionGate"];
  if (override === undefined || override === null || typeof override !== "object") {
    return undefined;
  }

  const rules = (override as ImmersionGateOverride).rules;
  if (rules === undefined || rules === null || typeof rules !== "object") {
    return undefined;
  }

  const merged: Record<string, ImmersionRuleConfig> = {};
  for (const [ruleId, ruleConfig,] of Object.entries(rules,)) {
    if (!KNOWN_RULES.has(ruleId,) || ruleConfig === undefined || ruleConfig === null) { continue; }
    const candidate = ruleConfig as Partial<ImmersionRuleConfig>;
    const severity = candidate.severity;
    const enabled = candidate.enabled;
    if (severity !== undefined && !SEVERITIES.includes(severity,)) { continue; }
    if (enabled === undefined && severity === undefined) { continue; }
    merged[ruleId as (typeof GATE_RULE_ORDER)[number]] = {
      enabled: enabled ?? true,
      severity: severity ?? base?.rules[ruleId as keyof typeof base.rules]?.severity ?? GateSeverity.Annotate,
    };
  }

  if (Object.keys(merged,).length === 0) { return undefined; }
  const fallback = base ?? DEFAULT_IMMERSION_CONFIG;
  return {
    ...fallback,
    rules: {
      ...fallback.rules,
      ...merged,
    },
  };
}
