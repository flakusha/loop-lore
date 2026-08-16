// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { llamaCppMeta, } from "./llama.js";
import { sdCppMeta, } from "./sd.js";

export const generationMeta = {
  type: "object" as const,
  description: "LLM generation provider configuration",
  properties: {
    providers: {
      type: "object",
      properties: {
        openaiCompatible: {
          type: "array",
          description: "OpenAI-compatible provider instances",
        },
      },
    },
    defaultProvider: {
      type: "string",
      description: "Default provider name",
    },
    defaultModels: {
      type: "object",
      description: "Default model per provider",
    },
    autoStart: {
      type: "object",
      description: "Auto-spawn external AI servers at startup",
      properties: {
        llamaCpp: llamaCppMeta,
        sdCpp: sdCppMeta,
      },
    },
  },
};
