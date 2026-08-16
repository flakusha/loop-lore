// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Config, } from "../../config/schema";
import { listProviders, } from "../providers/registry";

export function isLlmGenerationConfigured(config: Config,): boolean {
  return (
    !!config.generation.defaultProvider ||
    config.generation.providers.openaiCompatible.length > 0 ||
    listProviders().length > 0
  );
}
