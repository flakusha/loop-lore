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
    matting: {
      type: "object",
      description: "Background-removal (matting) backend for avatar/sprite cut-outs",
      properties: {
        backend: {
          type: "string",
          description:
            'Matting backend: "none" disables matting; "http" posts bytes to `endpoint`; "rembg" talks to a rembg server; "comfy" runs the native BiRefNet workflow; "auto" picks comfy, then rembg, then http',
        },
        endpoint: {
          type: "string",
          description:
            'HTTP endpoint ("http": URL accepting image bytes, returning PNG; "rembg": server base URL, e.g. http://127.0.0.1:7000)',
        },
        model: {
          type: "string",
          description:
            'Matting model ("rembg": model name, default isnet-general-use; bria-rmbg/RMBG-* weights are non-commercial; "comfy": background_removal weights file, default birefnet.safetensors)',
        },
        apiKey: {
          type: "string",
          description: 'Optional bearer token for the generic "http" backend',
        },
        timeoutMs: {
          type: "number",
          description: "Matting request timeout in ms (default 120000)",
        },
        decontaminate: {
          type: "boolean",
          description: "rembg only: request edge color decontamination (default true)",
        },
        autoEnqueue: {
          type: "boolean",
          description: "Auto-enqueue matting after emotion-avatar generation (default true)",
        },
      },
    },
  },
};
