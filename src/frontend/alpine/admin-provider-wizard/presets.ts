// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Descriptor of a wizard-managed provider (GET/POST /api/v1/admin/setup/providers). */
export interface ProviderDescriptor {
  name: string;
  label: string;
  baseUrl: string;
  model: string;
  /** Which provider family the instance materializes as — absent means openai-compatible. */
  kind?: string;
  allowedHosts: string[];
  hasApiKey: boolean;
  /** Whether the instance is live in the provider registry. */
  state: "live" | "error";
  /** Why the instance is not live — present only in the error state. */
  error?: string;
}

/** Provider health summary from the existing rescan route. */
export interface ProviderSummary {
  name: string;
  label: string;
  status: string;
  modelCount: number;
  latencyMs?: number;
  error?: string;
}

/** One check from the optional setup-state endpoint. */
export interface SetupCheck {
  id: string;
  ok: boolean;
  hint?: string;
}

/** Preset offered by the wizard picker. */
export interface ProviderPreset {
  id: string;
  label: string;
  baseUrl: string;
  model: string;
  /** Which provider family the backend materializes for this preset. */
  kind: "openai-compatible" | "anthropic" | "ollama-native";
}

/** Endpoints the wizard picker offers — the backend materializes every kind. */
export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    kind: "openai-compatible",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4o-mini",
    kind: "openai-compatible",
  },
  {
    id: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
    kind: "openai-compatible",
  },
  {
    id: "together",
    label: "Together",
    baseUrl: "https://api.together.xyz/v1",
    model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    kind: "openai-compatible",
  },
  {
    id: "ollama",
    label: "Ollama",
    baseUrl: "http://localhost:11434/v1",
    model: "llama3.2",
    kind: "openai-compatible",
  },
  {
    id: "lmstudio",
    label: "LM Studio",
    baseUrl: "http://localhost:1234/v1",
    model: "local-model",
    kind: "openai-compatible",
  },
  {
    id: "llamacpp",
    label: "llama.cpp",
    baseUrl: "http://localhost:8080/v1",
    model: "local-model",
    kind: "openai-compatible",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    baseUrl: "https://api.anthropic.com",
    model: "claude-sonnet-4-5",
    kind: "anthropic",
  },
  {
    id: "ollama-native",
    label: "Ollama (native)",
    baseUrl: "http://localhost:11434",
    model: "llama3.2",
    kind: "ollama-native",
  },
];

/** Model roles the wizard can assign (mirrors VALID_ROLES in src/admin/model-roles.ts). */
export const MODEL_ROLES = ["main", "auxiliary", "captioning", "classifier", "translator",] as const;

/**
 * Derive an instance name from a custom base URL.
 *
 * The backend accepts `^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$` for provider names,
 * so dots and dashes survive while everything else collapses to a dash. The
 * first character has to be alphanumeric, so leading symbols are dropped.
 * @param baseUrl - Operator-entered base URL.
 * @returns A backend-acceptable instance name.
 */
export function deriveProviderName(baseUrl: string,): string {
  const host = baseUrl.replace(/^https?:\/\//iu, "",).replace(/\/.*$/u, "",);
  const cleaned = host.replace(/[^a-zA-Z0-9._-]+/gu, "-",).replace(/^[^a-zA-Z0-9]+/u, "",).slice(0, 64,);
  return cleaned || "custom";
}
