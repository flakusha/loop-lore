import type { Config, } from "../../config/schema";
import { listProviders, } from "../providers/registry";

export function isLlmGenerationConfigured(config: Config,): boolean {
  return (
    !!config.generation.defaultProvider ||
    config.generation.providers.openaiCompatible.length > 0 ||
    listProviders().length > 0
  );
}
